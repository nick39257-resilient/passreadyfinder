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

/** Leads shown on the Command Center list — mailable takeaways only. */
export function isMailableDashboardLead(input: {
  businessType: string;
  fsaRating: number | null;
  email: string | null | undefined;
}): boolean {
  return (
    isTakeawayBusinessType(input.businessType) &&
    isWithinRatingBand(input.fsaRating) &&
    hasUsableEmail(input.email)
  );
}
