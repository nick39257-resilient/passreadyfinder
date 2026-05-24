#!/usr/bin/env node
import "dotenv/config";
import { runDrafter } from "../engine/drafter.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  try {
    const result = await runDrafter();

    console.log("---");
    console.log(`Drafted: ${result.drafted}`);
    if (result.errors.length > 0) {
      console.log(`Errors:  ${result.errors.length}`);
    }
    if (result.drafted === 0 && result.errors.length === 0) {
      console.log("No leads with draft_message IS NULL — nothing to do.");
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
