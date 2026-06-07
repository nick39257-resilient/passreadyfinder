/** Strict validation for outbound business email — postbox, send, scrape. */

const OUTREACH_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const BLOCKED_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "wordpress",
  "example",
  "sentry",
  "wix",
  "schema",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "privacy",
  "contact.privacy",
  "unsubscribe",
]);

const BLOCKED_DOMAIN_FRAGMENTS = [
  "example.com",
  "sentry.io",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "wixpress.com",
];

export type OutreachEmailIssue =
  | "empty"
  | "invalid_format"
  | "blocked_local_part"
  | "blocked_domain"
  | "html_or_escape_junk";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/** Strip scrape junk and pull the first email-like token from raw text. */
export function cleanOutreachEmail(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }

  let text = decodeHtmlEntities(raw.trim());
  if (/\\|&#|&quot;|&amp;/i.test(raw) && !OUTREACH_EMAIL_RE.test(text)) {
    text = text.replace(/\\+/g, " ").replace(/["'<>]/g, " ");
  }

  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return match?.[0]?.toLowerCase().trim() ?? null;
}

export function explainOutreachEmailIssue(
  raw: string | null | undefined,
): OutreachEmailIssue | null {
  if (!raw?.trim()) {
    return "empty";
  }

  if (/\\|&#|&quot;/i.test(raw)) {
    const cleaned = cleanOutreachEmail(raw);
    if (!cleaned) {
      return "html_or_escape_junk";
    }
  }

  const candidate = cleanOutreachEmail(raw) ?? raw.trim().toLowerCase();
  if (!OUTREACH_EMAIL_RE.test(candidate)) {
    return "invalid_format";
  }

  const local = candidate.split("@")[0] ?? "";
  const domain = candidate.split("@")[1] ?? "";

  if (
    BLOCKED_LOCAL_PARTS.has(local) ||
    local.includes("privacy") ||
    local.includes("noreply")
  ) {
    return "blocked_local_part";
  }

  const domainLower = domain.toLowerCase();
  if (BLOCKED_DOMAIN_FRAGMENTS.some((frag) => domainLower === frag || domainLower.endsWith(`.${frag}`))) {
    return "blocked_domain";
  }

  return null;
}

export function isValidOutreachEmail(raw: string | null | undefined): boolean {
  return explainOutreachEmailIssue(raw) === null && Boolean(cleanOutreachEmail(raw));
}

/** Normalized address for DB/send, or null when not mailable. */
export function normalizeOutreachEmail(raw: string | null | undefined): string | null {
  if (!isValidOutreachEmail(raw)) {
    return null;
  }
  return cleanOutreachEmail(raw);
}

export function formatOutreachEmailIssue(issue: OutreachEmailIssue): string {
  switch (issue) {
    case "empty":
      return "no email on record";
    case "invalid_format":
      return "invalid email format";
    case "blocked_local_part":
      return "blocked address (privacy/noreply/etc.)";
    case "blocked_domain":
      return "blocked domain (social/platform inbox)";
    case "html_or_escape_junk":
      return "scraped HTML junk — fix or re-scrape";
    default:
      return issue;
  }
}
