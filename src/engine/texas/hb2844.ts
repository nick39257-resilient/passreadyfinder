import { texasProductConfig } from "../../config/product.texas.config.js";
import type { MobileVendorTier } from "../../types/texas.js";

/** HB 2844 mobile pitch — stored in texas_outreach_templates and lead draft_message. */
export const HB2844_MOBILE_PITCH_TEMPLATE = `Hey [OwnerName],

Texas HB 2844 takes full effect July 1, 2026. DSHS is moving mobile food units onto a permanent statewide inspection and chain-of-custody record — paper logs during transport are increasingly a reason inspectors pause operations on-site.

We built the PassReady US mobile module for [BusinessName] and operators like you: digital temperature logs, transport records, and inspection-ready paperwork in one place before the July deadline.

Free DSHS readiness score check (no sign-up):
[ScoreUrl]

Learn more: [SiteUrl]

Happy to share a short walkthrough if useful.

— Nick Clark, PassReady US Compliance Desk`;

const TYPE_I_PATTERNS = [
  /\bpre[- ]?packaged\b/i,
  /\bpackaged only\b/i,
  /\bcoffee only\b/i,
  /\bcold storage\b/i,
  /\bno prep\b/i,
  /\bno preparation\b/i,
  /\bsealed\b/i,
  /\bshelf stable\b/i,
  /\bnon[- ]?potentially hazardous\b/i,
  /\bnph\b/i,
  /\bprepack\b/i,
] as const;

const TYPE_II_PATTERNS = [
  /\blimited prep\b/i,
  /\blimited preparation\b/i,
  /\bhot hold\b/i,
  /\bholding only\b/i,
  /\bassembly only\b/i,
  /\breheating only\b/i,
  /\bprep limited\b/i,
] as const;

const TYPE_III_PATTERNS = [
  /\bfull kitchen\b/i,
  /\bon[- ]?site cooking\b/i,
  /\bon site cooking\b/i,
  /\braw prep\b/i,
  /\braw preparation\b/i,
  /\bfrying\b/i,
  /\bfryer\b/i,
  /\bgrill\b/i,
  /\bsmoker\b/i,
  /\bbbq pit\b/i,
  /\braw chicken\b/i,
  /\braw protein\b/i,
  /\bcooking on site\b/i,
  /\btex[- ]?mex line\b/i,
] as const;

const MOBILE_PATTERNS =
  /\b(food truck|mobile food|mobile unit|mobile vendor|trailer|cart|taco truck|concession|mobile kitchen)\b/i;

export interface MobileVendorClassificationInput {
  businessName: string;
  vehicleType?: string | null;
  menuDescription?: string | null;
  primaryActivity?: string | null;
  facilityDescription?: string | null;
}

export function buildTierClassificationHaystack(
  input: MobileVendorClassificationInput,
): string {
  return [
    input.businessName,
    input.vehicleType,
    input.menuDescription,
    input.primaryActivity,
    input.facilityDescription,
  ]
    .filter((part) => part?.trim())
    .join(" ");
}

export function isLikelyMobileVendor(input: MobileVendorClassificationInput): boolean {
  const hay = buildTierClassificationHaystack(input);
  return MOBILE_PATTERNS.test(hay);
}

function matchesAny(hay: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(hay));
}

/**
 * HB 2844 (effective July 2026) — classify mobile vendor regulatory tier.
 * Only meaningful when {@link isLikelyMobileVendor} is true.
 */
export function classifyMobileVendorTier(
  input: MobileVendorClassificationInput,
  options?: { assumeMobile?: boolean },
): MobileVendorTier | null {
  if (!options?.assumeMobile && !isLikelyMobileVendor(input)) {
    return null;
  }

  const hay = buildTierClassificationHaystack(input);

  if (matchesAny(hay, TYPE_I_PATTERNS)) {
    return "TYPE_I";
  }
  if (matchesAny(hay, TYPE_III_PATTERNS)) {
    return "TYPE_III";
  }
  if (matchesAny(hay, TYPE_II_PATTERNS)) {
    return "TYPE_II";
  }

  return "TYPE_II";
}

export interface Hb2844OutreachParams {
  ownerName: string;
  businessName?: string;
  scoreUrl?: string;
}

export function buildHb2844MobileOutreachMessage(params: Hb2844OutreachParams): string {
  const owner = params.ownerName.trim() || "there";
  const custom = texasProductConfig.outreach.hb2844MobileTemplate?.trim();
  const template = custom || HB2844_MOBILE_PITCH_TEMPLATE;
  const scoreUrl = params.scoreUrl ?? texasProductConfig.outreach.scoreUrl;
  const siteUrl = texasProductConfig.outreach.siteUrl;

  return template
    .replace(/\[OwnerName\]/g, owner)
    .replace(/\[BusinessName\]/g, params.businessName?.trim() || "your truck")
    .replace(/\[ScoreUrl\]/g, scoreUrl)
    .replace(/\[SiteUrl\]/g, siteUrl);
}

export function defaultDshsLicenseStatus(): string {
  return texasProductConfig.defaultDshsLicenseStatus;
}
