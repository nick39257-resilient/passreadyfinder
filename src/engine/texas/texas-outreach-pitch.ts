import { getTexasAutopilotScoreUrl } from "../../config/score-urls.js";
import { buildTrackedLandingUrl } from "../outreach-landing-url.js";

const FIXED_SITE_SIGNATURE = "Nick Clark, PassReady US Compliance Desk";

/** Outreach copy for fixed-site Texas restaurants (non-mobile). */
export function buildTexasFixedSiteOutreachPitch(input: {
  leadId: number;
  businessName: string;
}): string {
  const scoreUrl = buildTrackedLandingUrl(
    getTexasAutopilotScoreUrl(),
    input.leadId,
  );
  const name = input.businessName.trim() || "your operation";

  return `Hey team,

I noticed your recent health inspection score. With Texas DSHS compliance requirements evolving, we built PassReady to help hospitality operators digitize food safety logs and stay inspection-ready.

Free score check for ${name} — no sign-up:
${scoreUrl}

Who is the best person to pass a free temporary access link to?

Thanks,
${FIXED_SITE_SIGNATURE}`;
}
