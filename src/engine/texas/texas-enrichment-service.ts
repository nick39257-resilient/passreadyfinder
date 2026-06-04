import {
  canCallApolloToday,
  findOwnerEmailViaApollo,
  isApolloConfigured,
} from "../services/apollo-service.js";
import { normalizeOutreachEmail } from "../outreach-halt.js";
import { runMigrations } from "../store/db.js";
import {
  getTexasLeadsNeedingApolloEnrichment,
  markTexasApolloEnrichmentAttempted,
  updateTexasLeadEmailFromApollo,
  type TexasLeadRow,
} from "../store/texas-leads-repository.js";
import { texasProductConfig } from "../../config/product.texas.config.js";
import {
  TEXAS_STATUS_EMAIL_SENT,
  TEXAS_STATUS_FORM_SUBMITTED,
} from "../../types/texas.js";

export type TexasApolloEnrichmentResult = {
  leadId: number;
  businessName: string;
  outcome: "email_found" | "no_match" | "skipped_has_email" | "apollo_cap_reached";
  email: string | null;
  ownerName: string | null;
  detail: string;
};

export function texasLeadToApolloInput(row: TexasLeadRow): {
  businessName: string;
  address: string;
  postcode: string;
  website: string | null;
} {
  const locationParts = [row.address, row.city, row.county, row.zip].filter(
    (part) => part?.trim(),
  );
  const address =
    locationParts.length > 0
      ? locationParts.join(", ")
      : row.business_name;

  return {
    businessName: row.business_name.trim(),
    address,
    postcode: row.zip?.trim() || row.city?.trim() || "TX",
    website: row.website,
  };
}

export async function enrichTexasLeadViaApollo(
  row: TexasLeadRow,
): Promise<TexasApolloEnrichmentResult> {
  const existing = normalizeOutreachEmail(row.email);
  if (existing) {
    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "skipped_has_email",
      email: existing,
      ownerName: row.owner_name,
      detail: "already_had_email",
    };
  }

  if (row.status === TEXAS_STATUS_EMAIL_SENT || row.status === TEXAS_STATUS_FORM_SUBMITTED) {
    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "skipped_has_email",
      email: null,
      ownerName: row.owner_name,
      detail: "outreach_already_sent",
    };
  }

  if (!(await canCallApolloToday())) {
    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "apollo_cap_reached",
      email: null,
      ownerName: null,
      detail: "apollo_daily_cap",
    };
  }

  const apollo = await findOwnerEmailViaApollo(texasLeadToApolloInput(row));

  if (apollo?.email) {
    await updateTexasLeadEmailFromApollo({
      leadId: row.id,
      email: apollo.email,
      ownerName: apollo.ownerName,
    });
    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "email_found",
      email: apollo.email,
      ownerName: apollo.ownerName,
      detail: `apollo:${apollo.source}`,
    };
  }

  await markTexasApolloEnrichmentAttempted(row.id);
  return {
    leadId: row.id,
    businessName: row.business_name,
    outcome: "no_match",
    email: null,
    ownerName: null,
    detail: "apollo_no_owner_email",
  };
}

function delayMs(): number {
  return texasProductConfig.enrichment.apolloDelayMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type TexasApolloBatchSummary = {
  scanned: number;
  emailFound: number;
  noMatch: number;
  skipped: number;
  capStopped: boolean;
};

/**
 * Batch Apollo enrichment for Texas leads missing email.
 * Ordered: critical intervention (≥79) first, then highest risk_score.
 */
export async function runTexasApolloEnrichmentBatch(options?: {
  limit?: number;
}): Promise<TexasApolloBatchSummary> {
  if (!isApolloConfigured()) {
    throw new Error(
      "Apollo not configured — set APOLLO_API_KEY in .env and ensure product.config enrichment.apolloEnabled is true",
    );
  }

  await runMigrations();

  const limit = options?.limit ?? texasProductConfig.enrichment.defaultBatchLimit;
  const leads = await getTexasLeadsNeedingApolloEnrichment(limit);

  const summary: TexasApolloBatchSummary = {
    scanned: 0,
    emailFound: 0,
    noMatch: 0,
    skipped: 0,
    capStopped: false,
  };

  console.log(
    `Texas Apollo enrichment: ${leads.length} lead(s) queued (critical + risk score order, limit ${limit})\n`,
  );

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i];
    const result = await enrichTexasLeadViaApollo(row);
    summary.scanned++;

    if (result.outcome === "email_found") {
      summary.emailFound++;
      console.log(
        `✓ [${row.risk_score}] ${result.businessName}: ${result.email} (${result.ownerName ?? "owner"}) — ${result.detail}`,
      );
    } else if (result.outcome === "no_match") {
      summary.noMatch++;
      console.log(`— [${row.risk_score}] ${result.businessName}: no Apollo match`);
    } else if (result.outcome === "skipped_has_email") {
      summary.skipped++;
    } else if (result.outcome === "apollo_cap_reached") {
      summary.capStopped = true;
      console.log(
        `\nApollo daily credit cap reached — stopped after ${summary.scanned} lead(s).`,
      );
      break;
    }

    if (i < leads.length - 1 && !summary.capStopped) {
      await sleep(delayMs());
    }
  }

  return summary;
}
