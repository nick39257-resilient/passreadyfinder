import { productConfig } from "../config/product.config.js";

/** Takeaways only — matches FSA BusinessType naming. */
export function isTakeawayBusinessType(businessType: string): boolean {
  const lower = businessType.trim().toLowerCase();
  return lower.includes("takeaway") || lower.includes("sandwich");
}

/** ≤ maxRating stars (non-numeric ratings included — Scotland etc.). */
export function isWithinRatingBand(fsaRating: number | null): boolean {
  if (fsaRating === null) {
    return true;
  }
  return fsaRating <= productConfig.maxRating;
}

export function hasUsableEmail(email: string | null | undefined): boolean {
  const trimmed = email?.trim();
  return Boolean(trimmed && trimmed.includes("@"));
}

export function hasReachableContact(input: {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
}): boolean {
  return (
    hasUsableEmail(input.email) ||
    Boolean(input.phone?.trim()) ||
    Boolean(input.website?.trim())
  );
}

/** Leads shown on the Command Center — takeaway ≤4★ with email, phone, or website. */
export function isMailableDashboardLead(input: {
  businessType: string;
  fsaRating: number | null;
  email: string | null | undefined;
  phone?: string | null;
  website?: string | null;
}): boolean {
  return (
    isTakeawayBusinessType(input.businessType) &&
    isWithinRatingBand(input.fsaRating) &&
    hasReachableContact(input)
  );
}

const OUTBOUND_STATUSES = new Set([
  "contacted",
  "replied",
  "opted_in",
  "trial_started",
  "nurture",
  "ready_to_review",
  "form_submitted",
]);

/** Keep emailed / replied leads visible even if they no longer pass the mailable filter. */
export function isOutboundDashboardLead(status: string | null | undefined): boolean {
  return OUTBOUND_STATUSES.has((status ?? "").trim().toLowerCase());
}

export function includeInDashboardList(input: {
  businessType: string;
  fsaRating: number | null;
  email: string | null | undefined;
  phone?: string | null;
  website?: string | null;
  status: string;
}): boolean {
  if (isOutboundDashboardLead(input.status)) {
    return true;
  }
  return isMailableDashboardLead(input);
}
