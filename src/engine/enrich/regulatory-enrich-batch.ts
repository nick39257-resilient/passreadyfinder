import type { FloridaLeadRow } from "../store/florida-leads-repository.js";
import {
  applyFloridaEnrichmentResult,
  listFloridaLeadsNeedingEnrichment,
} from "../store/florida-leads-repository.js";
import type { TexasLeadRow } from "../store/texas-leads-repository.js";
import {
  applyTexasEnrichmentResult,
  listTexasLeadsNeedingEnrichment,
} from "../store/texas-leads-repository.js";
import { runMigrations } from "../store/db.js";
import { runRegulatoryLeadEnrichment } from "./regulatory-lead-enrichment.js";
import { US_FLORIDA_FOOD_MARKET_ID, US_TEXAS_FOOD_MARKET_ID } from "../../markets/search-params.js";

export type RegulatoryEnrichJobParams = {
  marketId: string;
  location?: string | null;
  limit?: number;
};

export type RegulatoryEnrichSummary = {
  marketId: string;
  scanned: number;
  readyToContact: number;
  noContact: number;
  errors: number;
};

function perLeadDelayMs(): number {
  return Number(process.env.REGULATORY_ENRICH_DELAY_MS) || 1200;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichFloridaRow(row: FloridaLeadRow): Promise<"ready" | "no_contact" | "error"> {
  try {
    const result = await runRegulatoryLeadEnrichment({
      businessName: row.business_name,
      city: row.city,
      county: row.county,
      zip: row.zip,
      licenseNumber: row.license_number,
      phone: row.phone,
      email: row.email,
      website: row.website,
      region: "FLORIDA",
    });
    await applyFloridaEnrichmentResult({
      leadId: row.id,
      email: result.email,
      website: result.website,
      facebookUrl: result.facebookUrl,
      instagramUrl: result.instagramUrl,
      status: result.status,
      enrichmentDetail: result.enrichmentDetail,
    });
    return result.status === "ready_to_contact" ? "ready" : "no_contact";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[regulatory-enrich] Florida lead ${row.id} failed:`, message);
    await applyFloridaEnrichmentResult({
      leadId: row.id,
      email: null,
      website: row.website,
      facebookUrl: row.facebook_url,
      instagramUrl: row.instagram_url,
      status: "no_contact",
      enrichmentDetail: `error:${message.slice(0, 200)}`,
    });
    return "error";
  }
}

async function enrichTexasRow(row: TexasLeadRow): Promise<"ready" | "no_contact" | "error"> {
  try {
    const result = await runRegulatoryLeadEnrichment({
      businessName: row.business_name,
      city: row.city,
      county: row.county,
      zip: row.zip,
      licenseNumber: null,
      phone: row.phone,
      email: row.email,
      website: row.website,
      region: "TEXAS",
    });
    await applyTexasEnrichmentResult({
      leadId: row.id,
      email: result.email,
      website: result.website,
      facebookUrl: result.facebookUrl,
      instagramUrl: result.instagramUrl,
      status: result.status,
      enrichmentDetail: result.enrichmentDetail,
    });
    return result.status === "ready_to_contact" ? "ready" : "no_contact";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[regulatory-enrich] Texas lead ${row.id} failed:`, message);
    await applyTexasEnrichmentResult({
      leadId: row.id,
      email: null,
      website: row.website,
      facebookUrl: row.facebook_url,
      instagramUrl: row.instagram_url,
      status: "no_contact",
      enrichmentDetail: `error:${message.slice(0, 200)}`,
    });
    return "error";
  }
}

export async function runRegulatoryEnrichBatch(
  params: RegulatoryEnrichJobParams,
  onProgress?: (message: string) => void | Promise<void>,
): Promise<RegulatoryEnrichSummary> {
  await runMigrations();

  const marketId = params.marketId.trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 120);
  const report = async (msg: string) => {
    await onProgress?.(msg);
  };

  const summary: RegulatoryEnrichSummary = {
    marketId,
    scanned: 0,
    readyToContact: 0,
    noContact: 0,
    errors: 0,
  };

  if (marketId === US_FLORIDA_FOOD_MARKET_ID) {
    const rows = await listFloridaLeadsNeedingEnrichment(limit, {
      location: params.location ?? undefined,
    });
    await report(`Enriching ${rows.length} Florida lead(s) without contact endpoints…`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      await report(`Florida enrich ${i + 1}/${rows.length}: ${row.business_name}`);
      const outcome = await enrichFloridaRow(row);
      summary.scanned++;
      if (outcome === "ready") {
        summary.readyToContact++;
      } else if (outcome === "error") {
        summary.errors++;
      } else {
        summary.noContact++;
      }
      if (i < rows.length - 1) {
        await sleep(perLeadDelayMs());
      }
    }
    return summary;
  }

  if (marketId === US_TEXAS_FOOD_MARKET_ID) {
    const rows = await listTexasLeadsNeedingEnrichment(limit);
    await report(`Enriching ${rows.length} Texas lead(s) without contact endpoints…`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      await report(`Texas enrich ${i + 1}/${rows.length}: ${row.business_name}`);
      const outcome = await enrichTexasRow(row);
      summary.scanned++;
      if (outcome === "ready") {
        summary.readyToContact++;
      } else if (outcome === "error") {
        summary.errors++;
      } else {
        summary.noContact++;
      }
      if (i < rows.length - 1) {
        await sleep(perLeadDelayMs());
      }
    }
    return summary;
  }

  throw new Error(`Regulatory enrich not supported for market: ${marketId}`);
}
