import { parseInboundFromAddress } from "./inbound-email.js";

const tests: Array<{ raw: string; want: string | null }> = [
  { raw: "Chef <chef@takeaway.co.uk>", want: "chef@takeaway.co.uk" },
  { raw: "info@cafe.com", want: "info@cafe.com" },
  { raw: "", want: null },
];

let failed = 0;
for (const t of tests) {
  const got = parseInboundFromAddress(t.raw);
  if (got !== t.want) {
    console.error(`FAIL ${JSON.stringify(t.raw)} → ${got}, want ${t.want}`);
    failed++;
  }
}
if (failed > 0) {
  process.exit(1);
}
console.log(`inbound-email: ${tests.length} ok`);
