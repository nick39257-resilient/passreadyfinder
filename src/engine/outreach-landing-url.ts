import { productConfig } from "../config/product.config.js";

/** UK SafeScore — free FSA check; PassReady trial is the upsell on that page. */
export const DEFAULT_OUTREACH_LANDING_URL = "https://score.passready.uk";

/** Outreach CTA — set TRIAL_URL (legacy name) or SCORE_URL in .env. */
export function getOutreachLandingUrl(): string {
  const fromTrial = process.env[productConfig.outreach.trialUrlEnvKey]?.trim();
  if (fromTrial) {
    return fromTrial;
  }
  const fromScore = process.env.SCORE_URL?.trim();
  if (fromScore) {
    return fromScore;
  }
  return DEFAULT_OUTREACH_LANDING_URL;
}

/** First-touch emails may include only the SafeScore URL. Default on; set OUTREACH_FIRST_TOUCH_LINK=false to disable. */
export function firstTouchAllowsLandingLink(): boolean {
  const raw = process.env.OUTREACH_FIRST_TOUCH_LINK?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return true;
}

/** Append low-profile `rid` for score-traffic attribution (Touch 2/3 CTAs). */
export function buildTrackedLandingUrl(baseUrl: string, rid: number): string {
  const trimmed = baseUrl.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  url.searchParams.set("rid", String(rid));
  return url.toString();
}

export function shouldIncludeLandingInDraft(options: {
  includeLink?: boolean;
  hasReplied?: boolean;
  touchCount?: number;
}): boolean {
  if (options.includeLink !== undefined) {
    return options.includeLink;
  }
  if (options.hasReplied) {
    return true;
  }
  const touchCount = options.touchCount ?? 0;
  // Multi-touch sequence: touch 1 & 4 are link-free; touches 2–3 carry SafeScore/WhatsApp CTA.
  return touchCount === 1 || touchCount === 2;
}
