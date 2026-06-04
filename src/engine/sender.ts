import { Resend } from "resend";
import { getDailySendQuota } from "./daily-send-cap.js";
import {
  getDeliverabilityStatus,
  randomSendDelayMs,
  sleepWithProgress,
} from "./deliverability.js";
import {
  buildUnsubscribeUrl,
  ensureLeadUnsubscribeToken,
  isLeadOutreachHalted,
} from "./outreach-halt.js";
import { prepareOutboundMessage } from "./outreach-message.js";
import { getLeadById } from "./store/leads-repository.js";
import { runMigrations } from "./store/db.js";
import {
  filterLeadsAllowedToSend,
  getApprovedLeads,
  markLeadContacted,
  type ApprovedLead,
} from "./store/sender-repository.js";
import { isEmailSuppressed, normalizeOutreachEmail } from "./outreach-halt.js";

/** Override in .env — avoid scare-word subjects that hurt opens/spam scores. */
function outreachEmailSubject(): string {
  const custom = process.env.OUTREACH_EMAIL_SUBJECT?.trim();
  if (custom) return custom;
  return "Quick question about your kitchen records";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

function isTestEmailFallbackEnabled(): boolean {
  return process.env.ALLOW_TEST_EMAIL_FALLBACK?.trim().toLowerCase() === "true";
}

function resolveRecipient(lead: ApprovedLead): {
  to: string;
  usingTestFallback: boolean;
} {
  const businessEmail = lead.email?.trim();
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
}

export type SendProgressCallback = (message: string) => void | Promise<void>;

/** Sweep approved leads and send via Resend. Marks each as contacted or nurture on success. */
export async function runSender(onProgress?: SendProgressCallback): Promise<SendRunResult> {
  await runMigrations();

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

  const apiKey = requireEnv("RESEND_API_KEY");
  const fromEmail = requireEnv("FROM_EMAIL");
  const testFallbackEnabled = isTestEmailFallbackEnabled();
  const testEmail = process.env.TEST_EMAIL_ADDRESS?.trim();

  const resend = new Resend(apiKey);
  const quota = await getDailySendQuota();
  const result: SendRunResult = {
    sent: 0,
    skipped: 0,
    errors: [],
    dailyQuota: quota,
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

  const approvedPool = await getApprovedLeads(quota.remaining);
  const { allowed: leads, skippedSuppressed } = await filterLeadsAllowedToSend(approvedPool);

  if (skippedSuppressed > 0) {
    await report(`  ⊘ skipped ${skippedSuppressed} lead(s) — email on suppression list\n`);
  }

  if (leads.length === 0) {
    console.log("No approved leads to send.");
    return result;
  }

  await report(
    `Sending ${leads.length} approved lead(s) via Resend (${quota.sentToday}/${quota.cap} sent today, cap ${quota.cap})…`,
  );
  await report(`From: ${fromEmail}`);
  if (testFallbackEnabled && testEmail) {
    await report(`Test fallback enabled: ${testEmail} (only when lead has no business email)\n`);
  }

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      const row = await getLeadById(lead.id);
      if (!row || isLeadOutreachHalted(row)) {
        result.skipped++;
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
        await report(`  ⊘ skipped ${lead.business_name}: ${message}\n`);
        continue;
      }

      const sendAddress = normalizeOutreachEmail(to);
      if (sendAddress && (await isEmailSuppressed(sendAddress))) {
        result.skipped++;
        await report(`  ⊘ skipped ${lead.business_name} — suppressed email\n`);
        continue;
      }

      if (usingTestFallback) {
        await report(`→ ${lead.business_name}: TEST FALLBACK ${to}`);
      } else {
        await report(`→ ${lead.business_name}: ${to}`);
      }

      const hasReplied = Boolean(lead.replied_at?.trim());
      const { text, html } = prepareOutboundMessage({
        body: lead.draft_message,
        touchCount: lead.touch_count,
        hasReplied,
        unsubscribeUrl,
      });

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: outreachEmailSubject(),
        text,
        ...(html ? { html } : {}),
      });

      if (error) {
        throw new Error(error.message);
      }
      if (!data?.id) {
        throw new Error("Resend did not return a message id");
      }

      await markLeadContacted(lead.id, data.id);
      result.sent++;
      await report(`  ✓ sent (Resend id: ${data.id})\n`);

      if (i < leads.length - 1) {
        const delayMs = randomSendDelayMs();
        await sleepWithProgress(delayMs, report);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      await report(`  ✗ ${lead.business_name}: ${message}\n`);
    }
  }

  return result;
}
