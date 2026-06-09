import { texasProductConfig } from "../../config/product.texas.config.js";
import {
  TEXAS_STATUS_EMAIL_SENT,
  TEXAS_STATUS_FORM_SUBMITTED,
} from "../../types/texas.js";
import { buildEffectiveTexasOutreachDraft } from "./texas-outreach-meta.js";
import { texasLeadToApolloInput } from "./texas-enrichment-service.js";
import { findOwnerEmailViaApollo } from "../services/apollo-service.js";
import { isSmtpMailConfigured, sendSmtpMail } from "../services/smtp-mail-service.js";
import { tryWebsiteContactForm } from "../services/contact-form-service.js";
import { normalizeOutreachEmail } from "../outreach-halt.js";
import { runMigrations } from "../store/db.js";
import {
  getTexasLeadById,
  markTexasLeadEmailSent,
  markTexasLeadFormSubmitted,
  updateTexasLeadEmailFromApollo,
  type TexasLeadRow,
} from "../store/texas-leads-repository.js";

export type TexasOutreachResult = {
  leadId: number;
  channel: "email" | "contact_form";
  status: typeof TEXAS_STATUS_EMAIL_SENT | typeof TEXAS_STATUS_FORM_SUBMITTED;
  resendId?: string;
  contactPageUrl?: string | null;
};

function texasEmailSubject(row: TexasLeadRow): string {
  if (process.env.TEXAS_OUTREACH_EMAIL_SUBJECT?.trim()) {
    return process.env.TEXAS_OUTREACH_EMAIL_SUBJECT.trim();
  }
  if (row.is_mobile_vendor === 1) {
    return texasProductConfig.outreach.emailSubject;
  }
  return texasProductConfig.outreach.emailSubjectFixed;
}

function texasContactFormForceSubmit(): boolean {
  if (process.env.TEXAS_CONTACT_FORM_AUTO_SUBMIT?.trim().toLowerCase() === "true") {
    return true;
  }
  if (process.env.CONTACT_FORM_AUTO_SUBMIT?.trim().toLowerCase() === "true") {
    return true;
  }
  return false;
}

function resolvePitchText(row: TexasLeadRow): string {
  return buildEffectiveTexasOutreachDraft(row);
}

async function resolveEmailForTexasLead(row: TexasLeadRow): Promise<string | null> {
  const existing = normalizeOutreachEmail(row.email);
  if (existing) {
    return existing;
  }

  if (!process.env.APOLLO_API_KEY?.trim()) {
    return null;
  }

  const apollo = await findOwnerEmailViaApollo(texasLeadToApolloInput(row));

  if (!apollo?.email) {
    return null;
  }

  await updateTexasLeadEmailFromApollo({
    leadId: row.id,
    email: apollo.email,
    ownerName: apollo.ownerName,
  });

  return apollo.email.trim().toLowerCase();
}

async function sendTexasEmail(row: TexasLeadRow, to: string, text: string): Promise<string> {
  if (!isSmtpMailConfigured()) {
    throw new Error("EMAIL_PASS (or MAIL_PASSWORD) is required for SMTP outreach");
  }

  const { messageId } = await sendSmtpMail({
    to,
    subject: texasEmailSubject(row),
    text,
  });

  return messageId;
}

/**
 * Execute HB 2844 outreach for one Texas lead: SMTP email or Playwright contact form.
 */
export async function executeTexasLeadOutreach(leadId: number): Promise<TexasOutreachResult> {
  await runMigrations();

  const row = await getTexasLeadById(leadId);
  if (!row) {
    throw new Error("Texas lead not found");
  }

  if (row.status === TEXAS_STATUS_EMAIL_SENT || row.status === TEXAS_STATUS_FORM_SUBMITTED) {
    throw new Error(`Outreach already completed (${row.status})`);
  }

  const pitch = resolvePitchText(row);
  const to = await resolveEmailForTexasLead(row);

  if (to) {
    const resendId = await sendTexasEmail(row, to, pitch);
    await markTexasLeadEmailSent({ leadId: row.id, resendId });

    return {
      leadId: row.id,
      channel: "email",
      status: TEXAS_STATUS_EMAIL_SENT,
      resendId,
    };
  }

  if (row.website?.trim()) {
    const website = row.website?.trim();
    if (!website) {
      throw new Error("No website on file for contact form outreach");
    }

    const form = await tryWebsiteContactForm({
      website,
      businessName: row.business_name,
      message: pitch,
      forceSubmit: texasContactFormForceSubmit(),
    });

    if (!form.submitted) {
      const hint = texasContactFormForceSubmit()
        ? ""
        : " Enable CONTACT_FORM_AUTO_SUBMIT=true or TEXAS_CONTACT_FORM_AUTO_SUBMIT=true on the server.";
      throw new Error(`Contact form not submitted (${form.reason}).${hint}`);
    }

    await markTexasLeadFormSubmitted({
      leadId: row.id,
      contactPageUrl: form.contactPageUrl,
    });

    return {
      leadId: row.id,
      channel: "contact_form",
      status: TEXAS_STATUS_FORM_SUBMITTED,
      contactPageUrl: form.contactPageUrl,
    };
  }

  throw new Error(
    "No outreach path — need a valid email or a website URL on this Texas lead",
  );
}
