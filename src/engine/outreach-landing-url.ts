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
  if (firstTouchAllowsLandingLink() && (options.touchCount ?? 0) === 0) {
    return true;
  }
  return false;
}
