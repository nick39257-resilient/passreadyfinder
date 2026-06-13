import {
  TEXAS_URGENT_SUBJECT_SPINTAX,
  buildTexasHb2844SpintaxContext,
  normalizeTexasVendorCategory,
  resolveTexasHb2844Body,
  resolveTexasHb2844Subject,
} from "./texas-hb2844-spintax.js";

const ctx = buildTexasHb2844SpintaxContext({
  business_name: "Taco Truck TX",
  owner_name: "Maria",
  city: "Austin",
  address: "123 Congress Ave",
  postcode: "78701",
  scoreUrl: "https://score.passready.us?rid=1",
});

const subject = resolveTexasHb2844Subject(ctx);
if (!subject.includes("Taco Truck TX") || !/Quick note|Heads-up|Question|July 1 DSHS/.test(subject)) {
  console.error("Texas subject spintax failed:", subject);
  process.exit(1);
}

if (TEXAS_URGENT_SUBJECT_SPINTAX.includes("{{businessName}}") === false) {
  console.error("subject template missing businessName token");
  process.exit(1);
}

const typeI = resolveTexasHb2844Body(ctx, "TYPE_I");
const typeIII = resolveTexasHb2844Body(ctx, "TYPE_III");

if (!typeI.includes("Maria") || !/prepackaged|low-prep/i.test(typeI)) {
  console.error("TYPE_I body missing expected copy:", typeI);
  process.exit(1);
}

if (!typeIII.includes("temperature") || !typeIII.includes("allergen")) {
  console.error("TYPE_II/III body missing high-risk copy:", typeIII);
  process.exit(1);
}

if (normalizeTexasVendorCategory(null) !== "TYPE_II_III") {
  console.error("missing tier should default to TYPE_II_III");
  process.exit(1);
}

console.log("texas-hb2844-spintax.test: ok");
