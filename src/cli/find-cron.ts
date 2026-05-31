#!/usr/bin/env node
import "dotenv/config";
import { runFindLeadsJob } from "../engine/find-leads-job.js";
import { closeDb } from "../engine/store/db.js";
import { productConfig } from "../config/product.config.js";

async function main(): Promise<void> {
  try {
    const area =
      productConfig.area.mode === "localAuthority"
        ? productConfig.area.localAuthorityName
        : "UK";
    const result = await runFindLeadsJob({
      segmentation: { area, worstFirst: true },
    });
    console.log("---");
    console.log(`Stored: ${result.stored} · FSA matches: ${result.fetched}`);
    console.log(`API rows: ${result.apiRows} · Delta: ${result.deltaRows}`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
