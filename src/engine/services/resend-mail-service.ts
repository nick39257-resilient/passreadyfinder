import { Resend } from "resend";
import {
  getOutreachFromForRegion,
  type OutreachMailRegion,
} from "../outreach-mail-from.js";

export type { OutreachMailRegion } from "../outreach-mail-from.js";
export {
  describeOutreachSender,
  formatOutreachFromAddress,
  getDefaultReplyToEmail,
  getEmailFromName,
  getEmailUserForRegion,
  getOutreachFromForRegion,
} from "../outreach-mail-from.js";

let resendClient: Resend | null = null;

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getResendApiKey(): string {
  return readEnv("RESEND_API_KEY");
}

export function getResendClient(): Resend {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required for outbound email — set it in Render env");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function isOutreachMailConfigured(): boolean {
  return Boolean(getResendApiKey());
}

/** @deprecated Use isOutreachMailConfigured */
export const isSmtpMailConfigured = isOutreachMailConfigured;

/** @deprecated Use getDefaultReplyToEmail */
export function getEmailUser(): string {
  return readEnv("EMAIL_USER") || readEnv("MAIL_USERNAME") || "nick@passready.us";
}

/** @deprecated Use getDefaultReplyToEmail */
export function getPassreadyMailFrom(): string {
  return getEmailUser();
}

/** @deprecated Use getOutreachFromForRegion */
export const PASSREADY_MAIL_FROM = "nick@passready.us";

export async function sendOutreachMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** UK → nick@passready.uk; US/Texas → nick@passready.us */
  region?: OutreachMailRegion;
}): Promise<{ messageId: string }> {
  const region = input.region ?? "uk";
  const resend = getResendClient();
  const from = getOutreachFromForRegion(region);

  const { data, error } = await resend.emails.send({
    from,
    to: [input.to.trim()],
    subject: input.subject.trim(),
    text: input.text,
    ...(input.html?.trim() ? { html: input.html.trim() } : {}),
  });

  if (error) {
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Resend send failed";
    throw new Error(message);
  }

  const messageId = data?.id?.trim() || `resend-${Date.now()}`;
  return { messageId };
}

/** @deprecated Use sendOutreachMail */
export const sendSmtpMail = sendOutreachMail;
