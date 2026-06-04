import { isExcludedLead, textMatchesLeadExclusion } from "./lead-guardrails.js";

const venueCases: Array<{ name: string; type: string; want: boolean }> = [
  { name: "The Corner Cafe", type: "Restaurant/Cafe/Canteen", want: true },
  { name: "Joe's Coffee House", type: "Takeaway/sandwich shop", want: true },
  { name: "Artisan Roasters Ltd", type: "Takeaway/sandwich shop", want: true },
  { name: "Pizza Express", type: "Restaurant/Cafe/Canteen", want: false },
  { name: "Central Cafe", type: "Restaurant/Cafe/Canteen", want: true },
];

for (const t of venueCases) {
  const got = isExcludedLead({ businessName: t.name });
  if (got !== t.want) {
    console.error(`isExcludedLead(${JSON.stringify(t.name)}) = ${got}, want ${t.want}`);
    process.exit(1);
  }
}

if (textMatchesLeadExclusion("Blackburn with Darwen")) {
  console.error("local authority label must not match venue guardrail");
  process.exit(1);
}

if (!textMatchesLeadExclusion("Tea Room at the Park")) {
  console.error("expected Tea Room venue name to match");
  process.exit(1);
}

console.log("lead-guardrails: ok");
