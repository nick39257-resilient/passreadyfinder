import {
  isFirstTouchDraftValid,
  stripUrlsExceptLanding,
} from "./outreach-message.js";
import { DEFAULT_OUTREACH_LANDING_URL } from "./outreach-landing-url.js";
import { deobfuscateHtmlForEmail, harvestEmailsFromHtml } from "./enrich/website-email-scraper.js";

process.env.OUTREACH_FIRST_TOUCH_LINK = "true";

let failed = 0;

if (!isFirstTouchDraftValid(`Hi\n\n${DEFAULT_OUTREACH_LANDING_URL}`)) {
  console.error("should allow landing URL");
  failed++;
}
if (isFirstTouchDraftValid("See https://evil.com")) {
  console.error("should reject other URLs");
  failed++;
}

const stripped = stripUrlsExceptLanding(
  `Hi https://evil.com\n${DEFAULT_OUTREACH_LANDING_URL}`,
  DEFAULT_OUTREACH_LANDING_URL,
);
if (!stripped.includes(DEFAULT_OUTREACH_LANDING_URL) || stripped.includes("evil.com")) {
  console.error("stripUrlsExceptLanding FAIL", stripped);
  failed++;
}

const html = deobfuscateHtmlForEmail("orders [at] shop [dot] co [dot] uk");
const emails = harvestEmailsFromHtml(html, "https://shop.co.uk");
if (!emails.some((e) => e.includes("orders@"))) {
  console.error("deobfuscate harvest FAIL", emails);
  failed++;
}

if (failed > 0) {
  process.exit(1);
}
console.log("outreach-first-touch: ok");
