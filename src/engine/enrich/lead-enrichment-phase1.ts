import { findOwnerEmailViaApollo, isApolloConfigured } from "../services/apollo-service.js";
import { tryWebsiteContactForm } from "../services/contact-form-service.js";
import { withTimeout } from "../services/service-timeout.js";
import type { EnrichmentStatus, ContactMethod } from "../../types/enrichment.js";
import {
  LEAD_STATUS_FORM_SUBMITTED,
  LEAD_STATUS_READY_TO_REVIEW,
} from "../../types/enrichment.js";
import { getLeadById } from "../store/leads-repository.js";
import {
  markLeadEnrichmentFailed,
  markLeadEmailFromApollo,
  markLeadFormSubmitted,
  resetLeadEnrichmentIfStillPending,
  setLeadEnrichmentPending,
} from "../store/leads-enrichment-repository.js";
import { tryEnrichLeadEmailFromWebsite } from "./lead-email.js";

/** Per-lead Phase 1 cap (website scrape + Apollo + optional Playwright). */
const PHASE1_LEAD_TIMEOUT_MS = 45_000;

export type Phase1EnrichmentResult = {
  leadId: number;
  enrichmentStatus: EnrichmentStatus;
  contactMethod: ContactMethod | null;
  email: string | null;
  ownerName: string | null;
  detail: string;
};

async function runPhase1EnrichmentForLeadInner(
  leadId: number,
  options?: { allowContactForm?: boolean },
): Promise<Phase1EnrichmentResult> {
  const row = await getLeadById(leadId);
  if (!row) {
    throw new Error(`Lead ${leadId} not found`);
  }

  if (row.email?.trim()) {
    return {
      leadId,
      enrichmentStatus: "EMAIL_FOUND",
      contactMethod: "EMAIL",
      email: row.email.trim(),
      ownerName: row.owner_name?.trim() ?? null,
      detail: "already_had_email",
    };
  }

  await setLeadEnrichmentPending(leadId);

  try {
    if (row.website?.trim()) {
      const scraped = await tryEnrichLeadEmailFromWebsite(leadId, row.website);
      if (scraped) {
        await markLeadEmailFromApollo({
          leadId,
          email: scraped,
          ownerName: null,
          status: LEAD_STATUS_READY_TO_REVIEW,
          contactMethod: "EMAIL",
        });
        return {
          leadId,
          enrichmentStatus: "EMAIL_FOUND",
          contactMethod: "EMAIL",
          email: scraped,
          ownerName: null,
          detail: "website_scrape",
        };
      }
    }

    if (isApolloConfigured()) {
      const apollo = await findOwnerEmailViaApollo({
        businessName: row.business_name,
        address: row.address,
        postcode: row.postcode,
        website: row.website,
        ownerName: row.owner_name,
      });
      if (apollo?.email) {
        await markLeadEmailFromApollo({
          leadId,
          email: apollo.email,
          ownerName: apollo.ownerName,
          status: LEAD_STATUS_READY_TO_REVIEW,
          contactMethod: "EMAIL",
        });
        return {
          leadId,
          enrichmentStatus: "EMAIL_FOUND",
          contactMethod: "EMAIL",
          email: apollo.email,
          ownerName: apollo.ownerName,
          detail: `apollo:${apollo.source}`,
        };
      }
    }

    const allowForm =
      options?.allowContactForm === true ||
      process.env.PHASE1_CONTACT_FORM?.trim().toLowerCase() === "true";

    if (allowForm && row.website?.trim()) {
      const form = await tryWebsiteContactForm({
        website: row.website,
        businessName: row.business_name,
      });
      if (form.submitted) {
        await markLeadFormSubmitted({
          leadId,
          contactPageUrl: form.contactPageUrl,
        });
        return {
          leadId,
          enrichmentStatus: "NO_EMAIL_FALLBACK",
          contactMethod: "CONTACT_FORM",
          email: null,
          ownerName: null,
          detail: form.reason,
        };
      }
      if (form.contactPageUrl) {
        await markLeadEnrichmentFailed(leadId, form.reason);
        return {
          leadId,
          enrichmentStatus: "NO_EMAIL_FALLBACK",
          contactMethod: null,
          email: null,
          ownerName: null,
          detail: `${form.reason}@${form.contactPageUrl}`,
        };
      }
    }

    await markLeadEnrichmentFailed(leadId, "no_website_no_apollo_match");
    return {
      leadId,
      enrichmentStatus: "FAILED",
      contactMethod: null,
      email: null,
      ownerName: null,
      detail: "no_route",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markLeadEnrichmentFailed(leadId, `phase1_error:${message}`);
    return {
      leadId,
      enrichmentStatus: "FAILED",
      contactMethod: null,
      email: null,
      ownerName: null,
      detail: message,
    };
  } finally {
    await resetLeadEnrichmentIfStillPending(leadId, "phase1_idle_reset");
  }
}

export async function runPhase1EnrichmentForLead(
  leadId: number,
  options?: { allowContactForm?: boolean },
): Promise<Phase1EnrichmentResult> {
  try {
    return await withTimeout(
      PHASE1_LEAD_TIMEOUT_MS,
      "phase1_lead_enrichment",
      () => runPhase1EnrichmentForLeadInner(leadId, options),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markLeadEnrichmentFailed(leadId, `phase1_timeout:${message}`);
    await resetLeadEnrichmentIfStillPending(leadId, "phase1_timeout_reset");
    return {
      leadId,
      enrichmentStatus: "FAILED",
      contactMethod: null,
      email: null,
      ownerName: null,
      detail: message,
    };
  }
}
