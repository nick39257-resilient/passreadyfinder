import { texasProductConfig } from "../../config/product.texas.config.js";
import type { MobileVendorTier } from "../../types/texas.js";

const TYPE_I_PATTERNS =
  /\b(prepackaged|pre-packaged|packaged only|sealed|non-potentially hazardous|nph|shelf stable)\b/i;
const TYPE_III_PATTERNS =
  /\b(full kitchen|on-?site cooking|raw chicken|raw protein|grill|fryer|smoker|bbq pit|tex-mex line)\b/i;
const MOBILE_PATTERNS =
  /\b(food truck|mobile food|mobile unit|mobile vendor|trailer|cart|taco truck|concession)\b/i;

export function isLikelyMobileVendor(input: {
  businessName: string;
  vehicleType?: string | null;
}): boolean {
  const hay = `${input.businessName} ${input.vehicleType ?? ""}`.trim();
  return MOBILE_PATTERNS.test(hay);
}

/**
 * HB 2844 (effective July 2026) — classify mobile vendor regulatory tier.
 * Type I: prepackaged only · Type II: limited prep · Type III: full on-site cooking.
 */
export function classifyMobileVendorTier(input: {
  businessName: string;
  vehicleType?: string | null;
}): MobileVendorTier | null {
  if (!isLikelyMobileVendor(input)) {
    return null;
  }

  const hay = `${input.businessName} ${input.vehicleType ?? ""}`;
  if (TYPE_I_PATTERNS.test(hay)) {
    return "TYPE_I";
  }
  if (TYPE_III_PATTERNS.test(hay)) {
    return "TYPE_III";
  }
  return "TYPE_II";
}

export interface Hb2844OutreachParams {
  ownerName: string;
  businessName: string;
  scoreUrl?: string;
}

export function buildHb2844MobileOutreachMessage(params: Hb2844OutreachParams): string {
  const owner = params.ownerName.trim() || "there";
  const business = params.businessName.trim() || "your truck";
  const scoreUrl = params.scoreUrl ?? texasProductConfig.outreach.scoreUrl;

  return texasProductConfig.outreach.hb2844MobileTemplate
    .replace(/\[OwnerName\]/g, owner)
    .replace(/\[BusinessName\]/g, business)
    .replace(/\[ScoreUrl\]/g, scoreUrl);
}

export function defaultDshsLicenseStatus(): string {
  return texasProductConfig.defaultDshsLicenseStatus;
}
