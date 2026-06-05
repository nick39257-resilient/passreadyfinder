#!/usr/bin/env node
import "dotenv/config";
import { runTexasAutonomousOutreachBatch } from "../engine/texas/texas-autonomous-outreach.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  console.log("Texas autonomous outreach — website discovery, email scrape, contact forms\n");

  const summary = await runTexasAutonomousOutreachBatch({ limit });

  console.log("\n---");
  console.log(`Scanned:          ${summary.scanned}`);
  console.log(`Emails found:     ${summary.emailDiscovered}`);
  console.log(`Forms submitted:  ${summary.formSubmitted}`);
  console.log(`CAPTCHA skipped:  ${summary.captchaSkipped}`);
  console.log(`No contact path:  ${summary.noContact}`);
  console.log(`Errors:           ${summary.errors}`);

  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
