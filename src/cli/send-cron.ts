#!/usr/bin/env node
import "dotenv/config";
import { isOutreachDayMode } from "../engine/outreach-day-mode.js";
import { runLeadTriage } from "../engine/lead-triage.js";
import { runSender } from "../engine/sender.js";
import { getNextUkSendWindowLabel, getUkDateKey, isWithinUkSendWindow } from "../engine/send-schedule.js";
import { closeDb } from "../engine/store/db.js";
import { getInFlightSendJob } from "../engine/store/jobs-repository.js";
import { getSetting, setSetting } from "../engine/store/outreach-migrations.js";
import { countApprovedLeads, countSendReadyLeads } from "../engine/store/stats-repository.js";

const LAST_SEND_KEY = "last_send_day_uk";

async function main(): Promise<void> {
  try {
    const now = new Date();
    if (!isWithinUkSendWindow(now)) {
      console.log(`Outside UK send window. Next window: ${getNextUkSendWindowLabel(now)}.`);
      return;
    }

    const ukDay = getUkDateKey(now);
    if (!isOutreachDayMode()) {
      const lastSendDay = await getSetting(LAST_SEND_KEY);
      if (lastSendDay === ukDay) {
        console.log(`Already sent during today's UK window (${ukDay}).`);
        return;
      }
    }

    const inFlightSend = await getInFlightSendJob();
    if (inFlightSend) {
      console.log(
        `Send job already in progress (${inFlightSend.id}, ${inFlightSend.status}) — skipping cron run.`,
      );
      return;
    }

    const approvedBefore = await countApprovedLeads();
    const sendReadyBefore = await countSendReadyLeads();
    const result = await runSender();
    console.log("---");
    console.log(`Sent:   ${result.sent}`);
    console.log(`Postbox: ${approvedBefore} queued, ${sendReadyBefore} send-ready before run`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
    }

    if (result.dailyCapReached) {
      await setSetting(LAST_SEND_KEY, ukDay);
      console.log(`Daily cap reached — recorded send day ${ukDay}.`);
    } else if (result.sent > 0 && !isOutreachDayMode()) {
      await setSetting(LAST_SEND_KEY, ukDay);
      console.log(`Recorded UK send window run for ${ukDay} (${result.sent} sent).`);
    } else if (result.sent > 0 && isOutreachDayMode()) {
      console.log(`Day mode: sent ${result.sent} — will retry on next cron until daily cap.`);
    } else if (approvedBefore === 0) {
      console.log("Postbox empty — not recording send day.");
    } else if (sendReadyBefore === 0) {
      console.log(
        `Postbox had ${approvedBefore} queued but 0 send-ready emails — not recording send day.`,
      );
    } else if (result.sendLocked) {
      console.log("Send locked — will retry in window if cron runs again.");
    } else if (result.batchAlreadyRunning) {
      console.log("Another outbound batch is active — not recording send day.");
    } else {
      console.log(
        `Postbox had ${approvedBefore} lead(s) but 0 sent — not recording send day (will retry).`,
      );
    }

    const triage = await runLeadTriage();
    if (triage.flagged + triage.clearedPending + triage.routedWhatsapp + triage.movedToNurture > 0) {
      console.log(
        `Triage: flagged=${triage.flagged} clearedPending=${triage.clearedPending} whatsapp=${triage.routedWhatsapp} nurture=${triage.movedToNurture}`,
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

