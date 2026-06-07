import {
  cleanOutreachEmail,
  explainOutreachEmailIssue,
  isValidOutreachEmail,
  normalizeOutreachEmail,
} from "./outreach-email.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(
  cleanOutreachEmail('contact.privacy@us.mcd.com\\&#34;') === "contact.privacy@us.mcd.com",
  "should extract email from HTML junk",
);
assert(!isValidOutreachEmail('contact.privacy@us.mcd.com\\&#34;'), "privacy corporate inbox blocked");
assert(isValidOutreachEmail("owner@mytakeaway.co.uk"), "valid takeaway email");
assert(normalizeOutreachEmail("  Hello@Shop.Co.UK ") === "hello@shop.co.uk", "normalize trims and lowercases");
assert(explainOutreachEmailIssue("not-an-email") === "invalid_format", "invalid format");
assert(!isValidOutreachEmail("noreply@shop.co.uk"), "noreply blocked");

console.log("outreach-email: ok");
