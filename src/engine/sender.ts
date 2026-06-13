import { createLlmClient, draftSequenceFollowUpForLead } from "./drafter.js";
import { getDailySendQuota } from "./daily-send-cap.js";
import { getDeliverabilityStatus, sleepWithProgress } from "./deliverability.js";
import { isOutreachDayMode } from "./outreach-day-mode.js";
import {
  buildUnsubscribeUrl,
  ensureLeadUnsubscribeToken,
  isLeadOutreachHalted,
} from "./outreach-halt.js";
import { prepareOutboundMessage } from "./outreach-message.js";
import { flagLeadForReviewWithReason, getLeadById } from "./store/leads-repository.js";
import { runMigrations } from "./store/db.js";
import {
  claimReadyToContactBatch,
  filterLeadsAllowedToSend,
  markLeadContacted,
  markLeadFailedDelivery,
  OUTBOUND_BATCH_LIMIT,
  revertLeadToReadyToContact,
  type OutboundQueueLead,
} from "./store/sender-repository.js";
import { isEmailSuppressed, normalizeOutreachEmail } from "./outreach-halt.js";
import {
  getPassreadyMailFrom,
  isSmtpMailConfigured,
  sendSmtpMail,
} from "./services/smtp-mail-service.js";
import {
  applyBodySpintax,
  buildSpintaxLeadContext,
  resolveSpintaxSubject,
} from "./spintax.js";
import {
  buildTexasHb2844SpintaxContext,
  resolveTexasHb2844Body,
  resolveTexasHb2844Subject,
} from "./texas/texas-hb2844-spintax.js";
import { getOutreachLandingUrl } from "./outreach-landing-url.js";
import {
  releaseOutboundSendLock,
  tryAcquireOutboundSendLock,
} from "./outbound-send-lock.js";

/** Random delay between sends — faster in day mode while still human-paced. */
export function randomOutboundThrottleMs(): number {
  if (isOutreachDayMode()) {
    return Math.floor(Math.random() * (90_000 - 45_000 + 1)) + 45_000;
  }
  return Math.floor(Math.random() * (240_000 - 90_000 + 1)) + 90_000;
}

function isTestEmailFallbackEnabled(): boolean {
  return process.env.ALLOW_TEST_EMAIL_FALLBACK?.trim().toLowerCase() === "true";
}

function resolveRecipient(lead: OutboundQueueLead): {
  to: string;
  usingTestFallback: boolean;
} {
  const businessEmail = normalizeOutreachEmail(lead.email);
  if (businessEmail) {
    return { to: businessEmail, usingTestFallback: false };
  }

  const testEmail = process.env.TEST_EMAIL_ADDRESS?.trim();
  if (isTestEmailFallbackEnabled() && testEmail) {
    return { to: testEmail, usingTestFallback: true };
  }

  throw new Error(
    `No business email for ${lead.business_name} — skipped (set ALLOW_TEST_EMAIL_FALLBACK=true only for local testing).`,
  );
}

export interface SendRunResult {
  sent: number;
  skipped: number;
  errors: { leadId: number; businessName: string; error: string }[];
  sendLocked?: boolean;
  dailyCapReached?: boolean;
  dailyQuota?: { sentToday: number; cap: number; remaining: number };
  claimed?: number;
  batchAlreadyRunning?: boolean;
}

export type SendProgressCallback = (message: string) => void | Promise<void>;

/** Spintax subject + body for one outbound lead (UK default; HB 2844 when vendor_tier is set). */
export function buildOutboundSpintaxContent(
  lead: OutboundQueueLead,
  options: {
    customSubject: string | null;
    draftMessage: string;
  },
): { subject: string; body: string } {
  const spintaxContext = buildSpintaxLeadContext({
    business_name: lead.business_name,
    owner_name: lead.owner_name,
    local_authority_name: lead.local_authority_name,
    address: lead.address,
    postcode: lead.postcode,
  });

  if (lead.vendor_tier?.trim()) {
    const texasContext = buildTexasHb2844SpintaxContext({
      business_name: lead.business_name,
      owner_name: lead.owner_name,
      local_authority_name: lead.local_authority_name,
      address: lead.address,
      postcode: lead.postcode,
      scoreUrl: process.env.TEXAS_SCORE_URL?.trim() || getOutreachLandingUrl(),
    });
    return {
      subject: resolveTexasHb2844Subject(texasContext, options.customSubject),
      body: resolveTexasHb2844Body(texasContext, lead.vendor_tier),
    };
  }

  return {
    subject: resolveSpintaxSubject(
      spintaxContext,
      lead.touch_count,
      options.customSubject,
    ),
    body: applyBodySpintax(options.draftMessage, spintaxContext),
  };
}

/** Process ready_to_contact queue sequentially with spintax + human throttling. */
export async function runSender(onProgress?: SendProgressCallback): Promise<SendRunResult> {
  await runMigrations();

  if (!isSmtpMailConfigured()) {
    throw new Error("EMAIL_PASS (or MAIL_PASSWORD) is required in .env");
  }

  const deliverability = await getDeliverabilityStatus();
  if (deliverability.sendLocked) {
    console.log(`Sending locked: ${deliverability.reason}`);
    return {
      sent: 0,
      skipped: 0,
      errors: [],
      sendLocked: true,
    };
  }

  const lockAcquired = await tryAcquireOutboundSendLock();
  if (!lockAcquired) {
    console.log("Outbound send lock held — another batch is still running.");
    return {
      sent: 0,
      skipped: 0,
      errors: [],
      batchAlreadyRunning: true,
    };
  }

  try {
    return await runSenderBody(onProgress);
  } finally {
    await releaseOutboundSendLock();
  }
}

async function runSenderBody(onProgress?: SendProgressCallback): Promise<SendRunResult> {
  const testFallbackEnabled = isTestEmailFallbackEnabled();
  const testEmail = process.env.TEST_EMAIL_ADDRESS?.trim();
  const quota = await getDailySendQuota();
  const result: SendRunResult = {
    sent: 0,
    skipped: 0,
    errors: [],
    dailyQuota: quota,
    claimed: 0,
  };

  if (quota.remaining <= 0) {
    console.log(
      `Daily send cap reached (${quota.sentToday}/${quota.cap} today for this mailbox).`,
    );
    return { ...result, dailyCapReached: true };
  }

  const report = async (msg: string) => {
    console.log(msg);
    await onProgress?.(msg);
  };

  const batchLimit = Math.min(OUTBOUND_BATCH_LIMIT, quota.remaining);
  const claimedPool = await claimReadyToContactBatch(batchLimit);
  const { allowed: leads, skippedSuppressed } = await filterLeadsAllowedToSend(claimedPool);

  const allowedIds = new Set(leads.map((l) => l.id));
  for (const lead of claimedPool) {
    if (!allowedIds.has(lead.id)) {
      await revertLeadToReadyToContact(lead.id);
    }
  }

  result.claimed = leads.length;

  if (skippedSuppressed > 0) {
    await report(`  ⊘ skipped ${skippedSuppressed} lead(s) — email on suppression list\n`);
  }

  if (leads.length === 0) {
    console.log("No ready_to_contact leads to send.");
    return result;
  }

  await report(
    `Sending ${leads.length} lead(s) via Private Email SMTP (${quota.sentToday}/${quota.cap} sent today, batch cap ${OUTBOUND_BATCH_LIMIT})…`,
  );
  await report(`From: ${getPassreadyMailFrom()}`);
  if (testFallbackEnabled && testEmail) {
    await report(`Test fallback enabled: ${testEmail} (only when lead has no business email)\n`);
  }

  let followUpLlm: ReturnType<typeof createLlmClient> | null = null;
  const customSubject = process.env.OUTREACH_EMAIL_SUBJECT?.trim() || null;

  for (const lead of leads) {
    try {
      const row = await getLeadById(lead.id);
      if (!row || isLeadOutreachHalted(row)) {
        result.skipped++;
        await revertLeadToReadyToContact(lead.id);
        await report(`  ⊘ skipped ${lead.business_name} (outreach halted)\n`);
        continue;
      }

      const token = await ensureLeadUnsubscribeToken(lead.id);
      const unsubscribeUrl = buildUnsubscribeUrl(token);

      let to: string;
      let usingTestFallback = false;
      try {
        const resolved = resolveRecipient(lead);
        to = resolved.to;
        usingTestFallback = resolved.usingTestFallback;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.skipped++;
        await revertLeadToReadyToContact(lead.id);
        if (message.includes("No business email")) {
          await flagLeadForReviewWithReason(lead.id, "STUCK_IN_POSTBOX_NO_EMAIL");
        }
        await report(`  ⊘ skipped ${lead.business_name}: ${message}\n`);
        continue;
      }

      const sendAddress = normalizeOutreachEmail(to);
      if (sendAddress && (await isEmailSuppressed(sendAddress))) {
        result.skipped++;
        await revertLeadToReadyToContact(lead.id);
        await report(`  ⊘ skipped ${lead.business_name} — suppressed email\n`);
        continue;
      }

      if (usingTestFallback) {
        await report(`→ ${lead.business_name}: TEST FALLBACK ${to}`);
      } else {
        await report(`→ ${lead.business_name}: ${to}`);
      }

      const hasReplied = Boolean(lead.replied_at?.trim());
      const { subject, body: spintaxBody } = buildOutboundSpintaxContent(lead, {
        customSubject,
        draftMessage: lead.draft_message,
      });
      const { text, html } = prepareOutboundMessage({
        body: spintaxBody,
        touchCount: lead.touch_count,
        hasReplied,
        unsubscribeUrl,
      });

      const { messageId } = await sendSmtpMail({
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        region: "uk",
      });

      await markLeadContacted(lead.id, messageId);
      result.sent++;
      await report(`  ✓ sent (message id: ${messageId})\n`);

      try {
        followUpLlm ??= createLlmClient();
        const followUp = await draftSequenceFollowUpForLead(lead.id, followUpLlm);
        if (followUp.drafted) {
          const laneLabel =
            followUp.lane === "postbox"
              ? "ready_to_contact"
              : `Needs Eyes (${followUp.reason ?? "review"})`;
          await report(
            `  ↻ touch ${followUp.touch ?? "?"} follow-up drafted → ${laneLabel}\n`,
          );
        }
      } catch (followUpErr) {
        const msg = followUpErr instanceof Error ? followUpErr.message : String(followUpErr);
        await report(`  ⚠ follow-up draft failed: ${msg}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`SMTP send failed for lead ${lead.id} (${lead.business_name}):`, err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      await markLeadFailedDelivery(lead.id, message);
      await report(`  ✗ ${lead.business_name}: ${message} (marked failed_delivery)\n`);
    }

    const isLast = lead === leads[leads.length - 1];
    if (!isLast) {
      const delayMs = randomOutboundThrottleMs();
      await sleepWithProgress(delayMs, report);
    }
  }

  return result;
}
