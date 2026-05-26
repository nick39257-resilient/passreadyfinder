#!/usr/bin/env node
import "dotenv/config";
import {
  formatJobSlotUtc,
  getTodayJobSlotUtc,
  shouldRunFinderCron,
} from "../engine/cron-schedule.js";
import { runFindLeadsJob } from "../engine/find-leads-job.js";
import { closeDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  if (process.env.SKIP_CRON_SCHEDULE !== "1" && !shouldRunFinderCron()) {
    const slot = getTodayJobSlotUtc("find-leads");
    console.log(
      `Skipping FindLeads — not in today's window (scheduled ${formatJobSlotUtc(slot)}).`,
    );
    console.log("Set SKIP_CRON_SCHEDULE=1 to force a manual run.");
    return;
  }

  try {
    const result = await runFindLeadsJob();
    console.log("---");
    console.log(`Stored: ${result.stored} · FSA matches: ${result.fetched}`);
    console.log(`API rows: ${result.apiRows} · Delta: ${result.deltaRows}`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
