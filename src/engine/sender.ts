import { Resend } from "resend";
import { productConfig } from "../config/product.config.js";
import {
  formatDelayMinutes,
  getDeliverabilityStatus,
  randomSendDelayMs,
} from "./deliverability.js";
import { runMigrations } from "./store/db.js";
import {
  getApprovedLeads,
  markLeadContacted,
  type ApprovedLead,
} from "./store/sender-repository.js";

const EMAIL_SUBJECT = "passready / upcoming fsa inspection";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

function resolveRecipient(lead: ApprovedLead): {
  to: string;
  usingTestFallback: boolean;
} {
  const testEmail = process.env.TEST_EMAIL_ADDRESS?.trim();
  if (lead.email?.trim()) {
    return { to: lead.email.trim(), usingTestFallback: false };
  }
  if (testEmail) {
    return { to: testEmail, usingTestFallback: true };
  }
  throw new Error(
    `No email for ${lead.business_name} and TEST_EMAIL_ADDRESS is not set in .env`,
  );
}

function plainTextToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

export interface SendRunResult {
  sent: number;
  skipped: number;
  errors: { leadId: number; businessName: string; error: string }[];
  sendLocked?: boolean;
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
  const testEmail = process.env.TEST_EMAIL_ADDRESS?.trim();

  const resend = new Resend(apiKey);
  const leads = await getApprovedLeads();
  const result: SendRunResult = { sent: 0, skipped: 0, errors: [] };

  if (leads.length === 0) {
    console.log("No approved leads to send.");
    return result;
  }

  const report = async (msg: string) => {
    console.log(msg);
    await onProgress?.(msg);
  };

  await report(`Sending ${leads.length} approved lead(s) via Resend…`);
  await report(`From: ${fromEmail}`);
  if (testEmail) {
    await report(`Test fallback: ${testEmail} (used when lead has no email)\n`);
  }

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      const { to, usingTestFallback } = resolveRecipient(lead);

      if (usingTestFallback) {
        await report(`→ ${lead.business_name}: TEST ${to}`);
      } else {
        await report(`→ ${lead.business_name}: ${to}`);
      }

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: EMAIL_SUBJECT,
        text: lead.draft_message,
        html: plainTextToHtml(lead.draft_message),
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
        await report(`  Waiting ${formatDelayMinutes(delayMs)} before next send (human pacing)…`);
        await new Promise((r) => setTimeout(r, delayMs));
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
