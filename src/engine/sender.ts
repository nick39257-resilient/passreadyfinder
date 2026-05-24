import { Resend } from "resend";
import { runMigrations } from "./store/db.js";
import {
  getApprovedLeads,
  markLeadContacted,
  type ApprovedLead,
} from "./store/sender-repository.js";

const EMAIL_SUBJECT = "PassReady / Upcoming FSA Inspection";

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
}

/** Sweep approved leads and send via Resend. Marks each as 'contacted' on success. */
export async function runSender(): Promise<SendRunResult> {
  await runMigrations();

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

  console.log(`Sending ${leads.length} approved lead(s) via Resend…`);
  console.log(`From: ${fromEmail}`);
  if (testEmail) {
    console.log(`Test fallback: ${testEmail} (used when lead has no email)\n`);
  } else {
    console.log("Warning: TEST_EMAIL_ADDRESS not set — leads without email will fail.\n");
  }

  for (const lead of leads) {
    try {
      const { to, usingTestFallback } = resolveRecipient(lead);

      if (usingTestFallback) {
        console.log(`→ ${lead.business_name}: sending to TEST ${to} (no lead email on file)`);
      } else {
        console.log(`→ ${lead.business_name}: sending to ${to}`);
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
      console.log(`  ✓ sent (Resend id: ${data.id})\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      console.error(`  ✗ ${lead.business_name}: ${message}\n`);
    }
  }

  return result;
}
