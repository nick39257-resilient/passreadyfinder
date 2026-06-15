import type { FloridaFindJobParams, FloridaIngestionResult } from "../../types/florida.js";
import { floridaProductConfig } from "../../config/product.florida.config.js";
import { ingestFloridaDbprData } from "./florida-ingestion-service.js";
import { runMigrations } from "../store/db.js";
import { upsertFloridaLead } from "../store/florida-leads-repository.js";

export async function runFloridaFindPipeline(
  options?: FloridaFindJobParams & { location?: string },
): Promise<FloridaIngestionResult> {
  await runMigrations();

  const location = options?.location?.trim() || "Florida";
  const { leads, source } = await ingestFloridaDbprData({
    location,
    limit: options?.limit,
  });

  let stored = 0;
  let criticalCount = 0;

  for (const lead of leads) {
    await upsertFloridaLead(lead);
    stored++;
    if (lead.status === "critical") {
      criticalCount++;
    }
  }

  return {
    fetched: leads.length,
    stored,
    criticalCount,
    source,
  };
}

export function floridaMarketConfigured(): boolean {
  return Boolean(floridaProductConfig.ingestion.dataUrl);
}
