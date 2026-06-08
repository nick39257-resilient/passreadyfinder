#!/usr/bin/env node
import "dotenv/config";
import { runLeadTriage } from "../engine/lead-triage.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  try {
    const result = await runLeadTriage();
    console.log("Lead triage complete:");
    console.log(`  Scanned:         ${result.scanned}`);
    console.log(`  Flagged:         ${result.flagged}`);
    console.log(`  Cleared pending: ${result.clearedPending}`);
    console.log(`  WhatsApp routed: ${result.routedWhatsapp}`);
    console.log(`  Moved nurture:   ${result.movedToNurture}`);
    if (result.actions.length > 0) {
      console.log("  Actions:");
      for (const action of result.actions) {
        console.log(`    #${action.leadId} ${action.action} (${action.reason})`);
      }
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
