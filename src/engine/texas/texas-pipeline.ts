import type { TexasFindJobParams, TexasIngestionResult } from "../../types/texas.js";
import { runMigrations } from "../store/db.js";
import { upsertTexasLead } from "../store/texas-leads-repository.js";
import { upsertHb2844MobileTemplate } from "../store/texas-outreach-repository.js";
import { ingestTexasOpenData } from "./texasIngestionService.js";
import { reclassifyExistingTexasMobileLeads } from "./texas-tier-resync.js";

export async function runTexasFindPipeline(
  options?: TexasFindJobParams,
): Promise<TexasIngestionResult> {
  await runMigrations();
  await upsertHb2844MobileTemplate();

  const { leads, source } = await ingestTexasOpenData({
    source: options?.source,
    limit: options?.limit,
    mobileOnly: options?.mobileOnly,
  });

  let stored = 0;
  let mobileVendors = 0;
  let criticalCount = 0;

  for (const lead of leads) {
    await upsertTexasLead(lead);
    stored++;
    if (lead.isMobileVendor) {
      mobileVendors++;
    }
    if (lead.interventionLevel === "CRITICAL_INTERVENTION") {
      criticalCount++;
    }
  }

  const tierResync = await reclassifyExistingTexasMobileLeads();
  console.log(
    `Texas HB 2844 tier resync: ${tierResync.mobileUpdated} mobile unit(s) — TYPE_I=${tierResync.tierCounts.TYPE_I}, TYPE_II=${tierResync.tierCounts.TYPE_II}, TYPE_III=${tierResync.tierCounts.TYPE_III}`,
  );

  return {
    fetched: leads.length,
    stored,
    mobileVendors: tierResync.mobileUpdated || mobileVendors,
    criticalCount,
    source,
  };
}

/** Re-run vendor tier + HB 2844 draft on all existing texas_leads (no open-data fetch). */
export async function runTexasTierResyncPipeline(): Promise<{
  scanned: number;
  mobileUpdated: number;
  tierCounts: { TYPE_I: number; TYPE_II: number; TYPE_III: number };
}> {
  await runMigrations();
  return reclassifyExistingTexasMobileLeads();
}
