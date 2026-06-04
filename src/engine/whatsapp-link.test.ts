import { buildOutboundWaMeLink, normalizeWhatsAppDigits } from "./whatsapp-link.js";

const cases: Array<{ raw: string; want: string | null }> = [
  { raw: "07700 900123", want: "447700900123" },
  { raw: "https://wa.me/447700900123", want: "447700900123" },
  { raw: "+44 7700 900123", want: "447700900123" },
  { raw: "abc", want: null },
];

let failed = 0;
for (const t of cases) {
  const got = normalizeWhatsAppDigits(t.raw);
  if (got !== t.want) {
    console.error(`normalize FAIL ${t.raw} → ${got}, want ${t.want}`);
    failed++;
  }
}

const link = buildOutboundWaMeLink({
  businessName: "Test Takeaway",
  phone: "07700900123",
});
if (!link?.startsWith("https://wa.me/447700900123?text=")) {
  console.error("buildOutboundWaMeLink FAIL", link);
  failed++;
}

if (failed > 0) {
  process.exit(1);
}
console.log("whatsapp-link: ok");
