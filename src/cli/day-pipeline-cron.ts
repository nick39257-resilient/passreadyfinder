#!/usr/bin/env node
/**
 * Unattended draft + send loop — run on Render every 2h while OUTREACH_DAY_MODE=true.
 * Drafts eligible leads, then drains postbox up to daily cap.
 */
import "dotenv/config";
import { isOutreachDayMode } from "../engine/outreach-day-mode.js";
import { isEmailAutosendEnabled } from "../engine/outreach-strategy.js";
import { runQueueDrafter } from "../engine/queue-drafter.js";
import { runSender } from "../engine/sender.js";
import { closeDb } from "../engine/store/db.js";
import { getInFlightSendJob } from "../engine/store/jobs-repository.js";
import { countApprovedLeads, countSendReadyLeads } from "../engine/store/stats-repository.js";

async function main(): Promise<void> {
  if (!isOutreachDayMode() || !isEmailAutosendEnabled()) {
    console.log("Day pipeline skipped (day mode off or email autosend disabled).");
    return;
  }

  try {
    console.log("Day pipeline: drafting batch…");
    const draft = await runQueueDrafter();
    console.log(
      `  drafted=${draft.drafted} skipped=${draft.skipped} remaining=${draft.remainingNew} errors=${draft.errors.length}`,
    );

    const [queued, sendReady] = await Promise.all([
      countApprovedLeads(),
      countSendReadyLeads(),
    ]);
    console.log(`Postbox: ${queued} queued, ${sendReady} send-ready`);

    if (sendReady <= 0) {
      console.log("Nothing send-ready — pipeline stop.");
      return;
    }

    const inFlight = await getInFlightSendJob();
    if (inFlight) {
      console.log(`Send job in flight (${inFlight.id}) — skipping send this run.`);
      return;
    }

    console.log("Day pipeline: sending postbox…");
    const send = await runSender();
    console.log(`  sent=${send.sent} skipped=${send.skipped} errors=${send.errors.length}`);
    if (send.dailyCapReached) {
      console.log("Daily send cap reached for today.");
    }
    if (send.sendLocked) {
      console.log(`Send locked: ${send.sendLocked}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
