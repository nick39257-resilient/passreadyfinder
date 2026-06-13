import {
  describeOutreachSender,
  formatSmtpFromAddress,
  getEmailUserForRegion,
} from "./outreach-mail-from.js";

const ukFrom = describeOutreachSender("uk");
if (!ukFrom.fromEmail.includes("passready.uk")) {
  console.error("UK default from should use passready.uk:", ukFrom.fromEmail);
  process.exit(1);
}

const usFrom = describeOutreachSender("us");
if (!usFrom.fromEmail.includes("passready.us")) {
  console.error("US default from should use passready.us:", usFrom.fromEmail);
  process.exit(1);
}

const formatted = formatSmtpFromAddress("nick@passready.uk", "Nick – PassReady");
if (!formatted.includes('"Nick – PassReady"') || !formatted.includes("<nick@passready.uk>")) {
  console.error("formatSmtpFromAddress failed:", formatted);
  process.exit(1);
}

if (getEmailUserForRegion("uk") !== ukFrom.fromEmail) {
  console.error("getEmailUserForRegion mismatch");
  process.exit(1);
}

console.log("outreach-mail-from.test.ts OK");
