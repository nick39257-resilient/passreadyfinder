import {
  applySpintaxTemplate,
  buildSpintaxLeadContext,
  parseSpintax,
} from "./spintax.js";

const hiHello = parseSpintax("{Hi|Hello}");
if (!["Hi", "Hello"].includes(hiHello)) {
  console.error("parseSpintax should pick Hi or Hello");
  process.exit(1);
}

const ctx = buildSpintaxLeadContext({
  business_name: "Spice Corner",
  owner_name: "Ali",
  local_authority_name: "Preston",
  address: "12 Fishergate, Preston",
  postcode: "PR1 2AB",
});
const result = applySpintaxTemplate(
  "{Hi|Hello} {{managerName}} at {{businessName}} in {{town}}",
  ctx,
);
if (!result.includes("Ali") || !result.includes("Spice Corner") || !result.includes("PR1")) {
  console.error("applySpintaxTemplate field substitution failed:", result);
  process.exit(1);
}

console.log("spintax.test.ts OK");
