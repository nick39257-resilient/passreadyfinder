#!/usr/bin/env node
import "dotenv/config";
import { runTexasApolloEnrichmentBatch } from "../engine/texas/texas-enrichment-service.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const retryAttempted = process.argv.includes("--retry-attempted");

  console.log("Texas HB 2844 — Apollo owner email enrichment\n");
  if (retryAttempted) {
    console.log("Including leads previously attempted with no email (--retry-attempted).\n");
  }

  const summary = await runTexasApolloEnrichmentBatch({ limit, retryAttempted });

  console.log("\n---");
  console.log(`Scanned:      ${summary.scanned}`);
  console.log(`Emails found: ${summary.emailFound}`);
  console.log(`No match:     ${summary.noMatch}`);
  console.log(`Skipped:      ${summary.skipped}`);
  if (summary.capStopped) {
    console.log(
      "Stopped:      Successful email find cap reached (raise APOLLO_SUCCESSFUL_FIND_CAP to continue later)",
    );
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
