#!/usr/bin/env node
/**
 * Postbox audit — run: npm run diagnose-postbox
 * Lists approved leads and whether each can actually be sent.
 */
import "dotenv/config";
import { auditPostboxLeads } from "../engine/store/stats-repository.js";
import { closeDb, runMigrations } from "../engine/store/db.js";

async function main(): Promise<void> {
  await runMigrations();
  const audit = await auditPostboxLeads();

  console.log("\n=== Postbox audit ===\n");
  console.log(`  Queued (approved + draft)     ${audit.queued}`);
  console.log(`  Send-ready (valid email)      ${audit.sendReady}`);
  console.log(`  Blocked (missing/invalid)     ${audit.blocked}\n`);

  if (audit.leads.length === 0) {
    console.log("Postbox is empty.\n");
    return;
  }

  console.log("Lead".padEnd(36) + "Send?".padEnd(8) + "Issue");
  console.log("-".repeat(80));
  for (const lead of audit.leads) {
    const name = lead.businessName.slice(0, 34).padEnd(36);
    const ok = lead.sendReady ? "yes" : "no";
    const issue = lead.issue ?? (lead.email ? lead.email.slice(0, 40) : "—");
    console.log(`${name}${ok.padEnd(8)}${issue}`);
  }
  console.log("");
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
