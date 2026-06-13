export type OutreachMailRegion = "uk" | "us";

const UK_FROM_EMAIL = "nick@passready.uk";
const US_FROM_EMAIL = "nick@passready.us";
const DEFAULT_FROM_NAME = "Nick - PassReady";

export function getEmailFromName(): string {
  return process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
}

/** Visible From address for a market — fixed per domain for Resend verification. */
export function getEmailUserForRegion(region: OutreachMailRegion): string {
  if (region === "uk") {
    return process.env.EMAIL_USER_UK?.trim() || UK_FROM_EMAIL;
  }
  return process.env.EMAIL_USER?.trim() || process.env.MAIL_USERNAME?.trim() || US_FROM_EMAIL;
}

export function formatOutreachFromAddress(email: string, name?: string): string {
  const displayName = (name ?? getEmailFromName()).trim();
  const address = email.trim();
  if (!displayName) {
    return address;
  }
  const safeName = displayName.replace(/[<>]/g, "").trim();
  return `${safeName} <${address}>`;
}

/** Resend `from` string — UK vs US enforced by lead region. */
export function getOutreachFromForRegion(region: OutreachMailRegion): string {
  return formatOutreachFromAddress(getEmailUserForRegion(region));
}

export function describeOutreachSender(region: OutreachMailRegion): {
  region: OutreachMailRegion;
  fromName: string;
  fromEmail: string;
  formattedFrom: string;
  provider: "resend";
} {
  const fromEmail = getEmailUserForRegion(region);
  const fromName = getEmailFromName();
  return {
    region,
    fromName,
    fromEmail,
    formattedFrom: formatOutreachFromAddress(fromEmail, fromName),
    provider: "resend",
  };
}

/** Reply-to / autopilot identity — US mailbox by default. */
export function getDefaultReplyToEmail(): string {
  return getEmailUserForRegion("us");
}
