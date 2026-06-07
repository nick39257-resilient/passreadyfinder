#!/usr/bin/env node
import "dotenv/config";
import { runFindLeadsJob } from "../engine/find-leads-job.js";
import { closeDb } from "../engine/store/db.js";
import { productConfig } from "../config/product.config.js";

function cronEnrichTopN(): number | undefined {
  const raw = process.env.FIND_CRON_ENRICH_TOP_N?.trim();
  if (!raw) {
    return 15;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 15;
}

async function main(): Promise<void> {
  try {
    const area =
      productConfig.area.mode === "localAuthority"
        ? productConfig.area.localAuthorityName
        : "UK";
    const skipEnrichment = process.env.FIND_CRON_SKIP_ENRICHMENT?.trim() === "true";
    const result = await runFindLeadsJob({
      segmentation: { area, worstFirst: true },
      authorityBatch: area.trim().toLowerCase() === "uk",
      skipEnrichment,
      enrichTopNOverride: skipEnrichment ? 0 : cronEnrichTopN(),
    });
    console.log("---");
    console.log(`Stored: ${result.stored} · FSA matches: ${result.fetched}`);
    console.log(`API rows: ${result.apiRows} · Delta: ${result.deltaRows}`);
    if (result.syncTimestampUpdated) {
      console.log("Sync timestamp updated (full UK cycle complete).");
    } else {
      console.log("Partial UK batch — sync timestamp unchanged until full cycle.");
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
