import type { RawLead } from "../types/fsa.js";

/** Case-insensitive — whole-word / phrase match on name and FSA business type. */
export const EXCLUDED_LEAD_KEYWORDS = [
  "cafe",
  "coffee",
  "roasters",
  "bakery",
  "tea room",
  "sandwich bar",
] as const;

const EXCLUDED_RE = new RegExp(
  `\\b(${EXCLUDED_LEAD_KEYWORDS.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i",
);

export function textMatchesLeadExclusion(text: string | null | undefined): boolean {
  const trimmed = text?.trim();
  if (!trimmed) {
    return false;
  }
  return EXCLUDED_RE.test(trimmed);
}

/** Name guardrail only — FSA types like "Restaurant/Cafe/Caterer" stay (cafes filtered by name). */
export function isExcludedLead(lead: Pick<RawLead, "businessName" | "businessType">): boolean {
  return textMatchesLeadExclusion(lead.businessName);
}

export function exclusionReason(lead: Pick<RawLead, "businessName" | "businessType">): string | null {
  if (textMatchesLeadExclusion(lead.businessName)) {
    return `business_name:${lead.businessName}`;
  }
  return null;
}
