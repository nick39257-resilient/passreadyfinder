import type { RawLead } from "../types/fsa.js";

/** Case-insensitive — whole-word / phrase match on venue business names only. */
export const EXCLUDED_VENUE_NAME_KEYWORDS = [
  "cafe",
  "coffee",
  "roasters",
  "bakery",
  "tea room",
  "sandwich bar",
] as const;

const EXCLUDED_RE = new RegExp(
  `\\b(${EXCLUDED_VENUE_NAME_KEYWORDS.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i",
);

/**
 * Venue-name keyword check only. Do not pass FSA /BusinessTypes labels, local authority
 * names, or API query parameters — those may contain substrings like "Cafe".
 */
export function venueBusinessNameMatchesExclusion(
  businessName: string | null | undefined,
): boolean {
  const trimmed = businessName?.trim();
  if (!trimmed) {
    return false;
  }
  return EXCLUDED_RE.test(trimmed);
}

/** @deprecated Use {@link venueBusinessNameMatchesExclusion} — kept for tests/call sites. */
export function textMatchesLeadExclusion(text: string | null | undefined): boolean {
  return venueBusinessNameMatchesExclusion(text);
}

/**
 * After FSA JSON is fetched: skip cafes/coffee shops by venue name only.
 * Never inspects {@link RawLead.businessType} (e.g. Restaurant/Cafe/Canteen).
 */
export function isExcludedLead(lead: Pick<RawLead, "businessName">): boolean {
  return venueBusinessNameMatchesExclusion(lead.businessName);
}

export function exclusionReason(lead: Pick<RawLead, "businessName">): string | null {
  if (venueBusinessNameMatchesExclusion(lead.businessName)) {
    return `business_name:${lead.businessName}`;
  }
  return null;
}
