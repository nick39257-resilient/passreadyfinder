#!/usr/bin/env node
import "dotenv/config";
import { runSender } from "../engine/sender.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  try {
    const result = await runSender();
    console.log("---");
    console.log(`Sent:   ${result.sent}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
