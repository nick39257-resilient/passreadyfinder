#!/usr/bin/env node
import "dotenv/config";
import { runQueueDrafter } from "../engine/queue-drafter.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  try {
    const result = await runQueueDrafter();

    console.log("---");
    console.log(`Drafted this batch: ${result.drafted}`);
    console.log(`Skipped in pool:    ${result.skipped}`);
    console.log(`New still queued:   ${result.remainingNew}`);
    if (result.errors.length > 0) {
      console.log(`Errors:             ${result.errors.length}`);
    }
    if (result.drafted === 0 && result.errors.length === 0) {
      console.log("Nothing to draft — queue empty or no high-risk new leads.");
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
