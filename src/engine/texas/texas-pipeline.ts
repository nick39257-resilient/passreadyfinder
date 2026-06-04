import type { TexasFindJobParams, TexasIngestionResult } from "../../types/texas.js";
import { runMigrations } from "../store/db.js";
import { upsertTexasLead } from "../store/texas-leads-repository.js";
import { ingestTexasOpenData } from "./texasIngestionService.js";

export async function runTexasFindPipeline(
  options?: TexasFindJobParams,
): Promise<TexasIngestionResult> {
  await runMigrations();

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

  return {
    fetched: leads.length,
    stored,
    mobileVendors,
    criticalCount,
    source,
  };
}
