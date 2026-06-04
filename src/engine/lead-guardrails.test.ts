import { isExcludedLead, textMatchesLeadExclusion } from "./lead-guardrails.js";

const cases: Array<{ name: string; type: string; want: boolean }> = [
  { name: "Spice Garden Takeaway", type: "Takeaway/sandwich shop", want: false },
  { name: "The Corner Cafe", type: "Restaurant/Cafe/Caterer", want: true },
  { name: "Daily Coffee Roasters", type: "Takeaway/sandwich shop", want: true },
  { name: "Joe's Sandwich Bar", type: "Takeaway/sandwich shop", want: true },
  { name: "Pizza Express", type: "Restaurant/Cafe/Caterer", want: false },
  { name: "Central Cafe", type: "Restaurant/Cafe/Caterer", want: true },
];

let failed = 0;
for (const t of cases) {
  const got = isExcludedLead({ businessName: t.name, businessType: t.type });
  if (got !== t.want) {
    console.error(`FAIL ${t.name}: expected ${t.want}, got ${got}`);
    failed++;
  }
}
if (!textMatchesLeadExclusion("Tea Room at the Park")) {
  console.error("tea room phrase should match");
  failed++;
}
if (failed > 0) {
  process.exit(1);
}
console.log("lead-guardrails: ok");
