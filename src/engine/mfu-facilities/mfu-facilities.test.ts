import assert from "node:assert/strict";
import {
  formatUsPhone,
  hasExplicitMfuServiceEvidence,
  parseServicesFromText,
  passesFloridaCommissaryTaxonomy,
  passesTexasCpfTaxonomy,
} from "./shared.js";
import { parseSanAntonioCommissaryPdfText } from "./texas-cpf-extractor.js";

assert.equal(passesFloridaCommissaryTaxonomy("A Taste of Elegance Commissary Kitchen LLC"), true);
assert.equal(passesFloridaCommissaryTaxonomy("Joe's Pizza"), false);
assert.equal(passesTexasCpfTaxonomy("Potranco Commissary"), true);
assert.equal(passesTexasCpfTaxonomy("Central Preparation Facility Registration"), true);
assert.equal(passesTexasCpfTaxonomy("Taco Bell"), false);

assert.equal(hasExplicitMfuServiceEvidence("Commissary Services for food trucks"), true);
assert.equal(hasExplicitMfuServiceEvidence("Fine Dining Restaurant"), false);
assert.equal(
  hasExplicitMfuServiceEvidence("Mobile Food Dispensing Vehicle #12", { authorityListed: false }),
  false,
);

const services = parseServicesFromText("Services – Grease, trash, water, kitchen available");
assert.equal(services.grease_disposal, true);
assert.equal(services.potable_water_fill, true);
assert.equal(services.commercial_kitchen_access, true);

assert.equal(formatUsPhone("(210) 826-0800"), "+1-210-826-0800");

const samplePdfText = `APPROVED COMMISSARIES / CENTRAL PREPARATION FACILITIES
Cheesy Jane's\tPotranco Commissary
4200 Broadway\t12135 FM 1957
San Antonio, TX 78209\tSan Antonio, TX 78253
(210) 826-0800\t(210) 858-8124
Services – Dump/Fill\tServices – Grease, trash, water
`;
const parsed = parseSanAntonioCommissaryPdfText(samplePdfText);
assert.ok(parsed.length >= 2);
assert.ok(parsed.some((p) => /Cheesy Jane/i.test(p.name)));
assert.ok(parsed.some((p) => /Potranco/i.test(p.name)));

console.log("mfu-facilities.test.ts: ok");
