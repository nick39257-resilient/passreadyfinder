export type OutreachMailRegion = "uk" | "us";

const DEFAULT_US_EMAIL = "nick@passready.us";
const DEFAULT_UK_EMAIL = "nick@passready.uk";
const DEFAULT_FROM_NAME = "Nick – PassReady";

export function getEmailFromName(): string {
  return process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
}

/** SMTP login user — may differ from the visible From address when using aliases. */
export function getSmtpAuthUser(): string {
  return (
    process.env.EMAIL_AUTH_USER?.trim() ||
    process.env.EMAIL_USER?.trim() ||
    process.env.MAIL_USERNAME?.trim() ||
    DEFAULT_US_EMAIL
  );
}

export function getEmailUserForRegion(region: OutreachMailRegion): string {
  if (region === "uk") {
    return (
      process.env.EMAIL_USER_UK?.trim() ||
      process.env.UK_EMAIL_USER?.trim() ||
      DEFAULT_UK_EMAIL
    );
  }
  return (
    process.env.EMAIL_USER?.trim() ||
    process.env.MAIL_USERNAME?.trim() ||
    DEFAULT_US_EMAIL
  );
}

export function formatSmtpFromAddress(email: string, name?: string): string {
  const displayName = (name ?? getEmailFromName()).trim();
  const address = email.trim();
  if (!displayName) {
    return address;
  }
  const safeName = displayName.replace(/"/g, "'");
  return `"${safeName}" <${address}>`;
}

export function getSmtpFromForRegion(region: OutreachMailRegion): string {
  return formatSmtpFromAddress(getEmailUserForRegion(region));
}

export function describeOutreachSender(region: OutreachMailRegion): {
  region: OutreachMailRegion;
  fromName: string;
  fromEmail: string;
  formattedFrom: string;
  authUser: string;
} {
  const fromEmail = getEmailUserForRegion(region);
  const fromName = getEmailFromName();
  return {
    region,
    fromName,
    fromEmail,
    formattedFrom: formatSmtpFromAddress(fromEmail, fromName),
    authUser: getSmtpAuthUser(),
  };
}
