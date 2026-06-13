import type { OutreachMailRegion } from "./outreach-mail-from.js";
import { describeOutreachSender } from "./outreach-mail-from.js";
import { isOutreachMailConfigured, sendOutreachMail } from "./services/resend-mail-service.js";
import { applySpintaxTemplate, buildSpintaxLeadContext } from "./spintax.js";
import { resolveTexasHb2844Subject, buildTexasHb2844SpintaxContext } from "./texas/texas-hb2844-spintax.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidTestRecipient(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

function buildUkTestSubject(): string {
  const ctx = buildSpintaxLeadContext({
    business_name: "Test Kitchen",
    owner_name: "Alex",
    local_authority_name: "Preston",
    address: "1 Fishergate",
    postcode: "PR1 1AA",
  });
  return applySpintaxTemplate(
    "{Quick one|Question} about {{businessName}} on {{street}}",
    ctx,
  );
}

function buildUsTestSubject(): string {
  const ctx = buildTexasHb2844SpintaxContext({
    business_name: "Test Food Truck",
    owner_name: "Alex",
    city: "Austin",
    address: "100 Congress Ave",
    postcode: "78701",
    scoreUrl: "https://score.passready.us?rid=0",
  });
  return resolveTexasHb2844Subject(ctx);
}

function buildTestBody(region: OutreachMailRegion, sender: ReturnType<typeof describeOutreachSender>): string {
  const sampleSubject = region === "uk" ? buildUkTestSubject() : buildUsTestSubject();

  return [
    "PassReady deliverability test",
    "",
    "This is a diagnostic message — not live outreach.",
    "",
    `Region: ${region.toUpperCase()}`,
    `From: ${sender.formattedFrom}`,
    `Provider: Resend`,
    "",
    "Sample subject style used for this test:",
    sampleSubject,
    "",
    "What to check:",
    "1. Did this land in Inbox (not Spam/Promotions)?",
    "2. Send another test to mail-tester.com — aim for 8/10+.",
    "3. Verify passready.uk and passready.us are verified in Resend.",
    "",
    "— PassReady Finder deliverability check",
  ].join("\n");
}

export async function sendDeliverabilityTest(input: {
  to: string;
  region: OutreachMailRegion;
}): Promise<{
  ok: true;
  to: string;
  region: OutreachMailRegion;
  from: string;
  subject: string;
  messageId: string;
}> {
  if (!isOutreachMailConfigured()) {
    throw new Error("RESEND_API_KEY is not configured — set it in Render env before test sends");
  }

  const to = input.to.trim();
  if (!isValidTestRecipient(to)) {
    throw new Error("Invalid test recipient email");
  }

  const sender = describeOutreachSender(input.region);
  const subject =
    input.region === "uk"
      ? `[PassReady test] ${buildUkTestSubject()}`
      : `[PassReady test] ${buildUsTestSubject()}`;
  const text = buildTestBody(input.region, sender);

  const { messageId } = await sendOutreachMail({
    to,
    subject,
    text,
    region: input.region,
  });

  return {
    ok: true,
    to,
    region: input.region,
    from: sender.formattedFrom,
    subject,
    messageId,
  };
}
