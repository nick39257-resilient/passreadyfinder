import { findOwnerEmailViaApollo, isApolloConfigured } from "../services/apollo-service.js";
import { tryWebsiteContactForm } from "../services/contact-form-service.js";
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
  setLeadEnrichmentPending,
} from "../store/leads-enrichment-repository.js";
import { tryEnrichLeadEmailFromWebsite } from "./lead-email.js";

export type Phase1EnrichmentResult = {
  leadId: number;
  enrichmentStatus: EnrichmentStatus;
  contactMethod: ContactMethod | null;
  email: string | null;
  ownerName: string | null;
  detail: string;
};

export async function runPhase1EnrichmentForLead(
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
    try {
      const apollo = await findOwnerEmailViaApollo({
        businessName: row.business_name,
        address: row.address,
        postcode: row.postcode,
        website: row.website,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markLeadEnrichmentFailed(leadId, `apollo_error:${message}`);
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

  const allowForm =
    options?.allowContactForm === true ||
    process.env.PHASE1_CONTACT_FORM?.trim().toLowerCase() === "true";

  if (allowForm && row.website?.trim()) {
    try {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markLeadEnrichmentFailed(leadId, `contact_form:${message}`);
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

  await markLeadEnrichmentFailed(leadId, "no_website_no_apollo_match");
  return {
    leadId,
    enrichmentStatus: "FAILED",
    contactMethod: null,
    email: null,
    ownerName: null,
    detail: "no_route",
  };
}
