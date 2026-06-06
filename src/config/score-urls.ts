/** Autopilot outreach must always use these SafeScore URLs (not env overrides). */
export const UK_SCORE_SITE_URL = "https://score.passready.uk";
export const TEXAS_SCORE_SITE_URL = "https://score.passready.us";

export function getUkAutopilotScoreUrl(): string {
  return UK_SCORE_SITE_URL;
}

export function getTexasAutopilotScoreUrl(): string {
  return TEXAS_SCORE_SITE_URL;
}
