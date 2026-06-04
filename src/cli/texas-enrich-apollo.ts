#!/usr/bin/env node
import "dotenv/config";
import { runTexasApolloEnrichmentBatch } from "../engine/texas/texas-enrichment-service.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  console.log("Texas HB 2844 — Apollo owner email enrichment\n");

  const summary = await runTexasApolloEnrichmentBatch({ limit });

  console.log("\n---");
  console.log(`Scanned:      ${summary.scanned}`);
  console.log(`Emails found: ${summary.emailFound}`);
  console.log(`No match:     ${summary.noMatch}`);
  console.log(`Skipped:      ${summary.skipped}`);
  if (summary.capStopped) {
    console.log("Stopped:      Apollo daily cap reached (re-run tomorrow or raise apolloDailyCap)");
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
