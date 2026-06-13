import {
  describeOutreachSender,
  formatOutreachFromAddress,
  getEmailUserForRegion,
  getOutreachFromForRegion,
} from "./outreach-mail-from.js";

const ukFrom = describeOutreachSender("uk");
if (ukFrom.fromEmail !== "nick@passready.uk") {
  console.error("UK from should be nick@passready.uk:", ukFrom.fromEmail);
  process.exit(1);
}

const usFrom = describeOutreachSender("us");
if (usFrom.fromEmail !== "nick@passready.us") {
  console.error("US from should be nick@passready.us:", usFrom.fromEmail);
  process.exit(1);
}

const formatted = formatOutreachFromAddress("nick@passready.uk", "Nick - PassReady");
if (!formatted.includes("Nick - PassReady") || !formatted.includes("<nick@passready.uk>")) {
  console.error("formatOutreachFromAddress failed:", formatted);
  process.exit(1);
}

if (getOutreachFromForRegion("uk") !== ukFrom.formattedFrom) {
  console.error("getOutreachFromForRegion uk mismatch");
  process.exit(1);
}

if (getEmailUserForRegion("us") !== "nick@passready.us") {
  console.error("getEmailUserForRegion us mismatch");
  process.exit(1);
}

if (ukFrom.provider !== "resend") {
  console.error("expected resend provider");
  process.exit(1);
}

console.log("outreach-mail-from.test.ts OK");
