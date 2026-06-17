import { floridaProductConfig } from "../../config/product.florida.config.js";
import { normalizeOutreachEmail } from "../outreach-halt.js";
import { isOutreachMailConfigured, sendOutreachMail } from "../services/resend-mail-service.js";
import { runMigrations } from "../store/db.js";
import {
  getFloridaLeadById,
  markFloridaLeadOutreachSent,
  type FloridaLeadRow,
} from "../store/florida-leads-repository.js";

export type FloridaOutreachResult = {
  leadId: number;
  channel: "email" | "social";
  status: "EMAIL_SENT" | "social_ready";
  resendId?: string;
  detail: string;
};

function floridaEmailSubject(row: FloridaLeadRow): string {
  const custom = process.env.FLORIDA_OUTREACH_EMAIL_SUBJECT?.trim();
  if (custom) {
    return custom;
  }
  return `DBPR readiness check — ${row.business_name}`;
}

function resolveFloridaPitch(row: FloridaLeadRow): string {
  if (row.draft_message?.trim()) {
    return row.draft_message.trim();
  }
  const place = [row.city, row.county].filter(Boolean).join(", ") || "Florida";
  return `Hi ${row.business_name} team,

PassReady helps Florida food operators close DBPR inspection gaps before the next visit. We flagged recent inspection activity in ${place}.

Free readiness score: ${floridaProductConfig.outreach.scoreUrl}

Best,
Nick Clark, PassReady US Compliance Desk`;
}

export async function executeFloridaLeadOutreach(leadId: number): Promise<FloridaOutreachResult> {
  await runMigrations();
  const row = await getFloridaLeadById(leadId);
  if (!row) {
    throw new Error("Florida lead not found");
  }

  const email = normalizeOutreachEmail(row.email);
  if (email) {
    if (!isOutreachMailConfigured()) {
      throw new Error("RESEND_API_KEY is required for automated Florida outreach");
    }
    const { messageId } = await sendOutreachMail({
      to: email,
      subject: floridaEmailSubject(row),
      text: resolveFloridaPitch(row),
      region: "us",
    });
    await markFloridaLeadOutreachSent({ leadId, resendId: messageId });
    return {
      leadId,
      channel: "email",
      status: "EMAIL_SENT",
      resendId: messageId,
      detail: "resend_sent",
    };
  }

  if (row.facebook_url?.trim() || row.instagram_url?.trim()) {
    return {
      leadId,
      channel: "social",
      status: "social_ready",
      detail: row.facebook_url?.trim() || row.instagram_url?.trim() || "social_handle",
    };
  }

  throw new Error("No email or verified social handle on this lead — run enrichment first");
}
