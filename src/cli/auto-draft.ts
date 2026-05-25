#!/usr/bin/env node
import "dotenv/config";
import { runAutoDrafter } from "../engine/auto-drafter.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  try {
    const result = await runAutoDrafter();

    console.log("---");
    console.log(`Drafted: ${result.drafted}`);
    console.log(`Skipped: ${result.skipped} (below risk threshold or already ineligible)`);
    if (result.errors.length > 0) {
      console.log(`Errors:  ${result.errors.length}`);
    }
    if (result.drafted === 0 && result.errors.length === 0) {
      console.log(
        "No eligible leads — need status=new, contacted_at NULL, riskScore > 75.",
      );
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
