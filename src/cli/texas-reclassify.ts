#!/usr/bin/env node
import "dotenv/config";
import { runTexasTierResyncPipeline } from "../engine/texas/texas-pipeline.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  console.log("Texas HB 2844 — reclassify mobile vendor tiers + outreach drafts\n");
  const result = await runTexasTierResyncPipeline();
  console.log("---");
  console.log(`Scanned:        ${result.scanned}`);
  console.log(`Mobile updated: ${result.mobileUpdated}`);
  console.log(`TYPE_I:         ${result.tierCounts.TYPE_I}`);
  console.log(`TYPE_II:        ${result.tierCounts.TYPE_II}`);
  console.log(`TYPE_III:       ${result.tierCounts.TYPE_III}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
