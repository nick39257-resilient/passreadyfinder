#!/usr/bin/env node
import "dotenv/config";
import { runSender } from "../engine/sender.js";
import { getNextUkSendWindowLabel, getUkDateKey, isWithinUkSendWindow } from "../engine/send-schedule.js";
import { closeDb } from "../engine/store/db.js";
import { getSetting, setSetting } from "../engine/store/outreach-migrations.js";

const LAST_SEND_KEY = "last_send_day_uk";

async function main(): Promise<void> {
  try {
    const now = new Date();
    if (!isWithinUkSendWindow(now)) {
      console.log(`Outside UK send window. Next window: ${getNextUkSendWindowLabel(now)}.`);
      return;
    }

    const ukDay = getUkDateKey(now);
    const lastSendDay = await getSetting(LAST_SEND_KEY);
    if (lastSendDay === ukDay) {
      console.log(`Already sent during today's UK window (${ukDay}).`);
      return;
    }

    const result = await runSender();
    console.log("---");
    console.log(`Sent:   ${result.sent}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
    }

    await setSetting(LAST_SEND_KEY, ukDay);
    console.log(`Recorded UK send window run for ${ukDay}.`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

