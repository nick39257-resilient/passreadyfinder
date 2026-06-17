#!/usr/bin/env tsx
/**
 * Extract Texas CPF and Florida commissary records to strict JSON schema.
 *
 * Usage:
 *   npm run extract:mfu-facilities -- --state=FL --location="Orlando"
 *   npm run extract:mfu-facilities -- --state=TX
 *   npm run extract:mfu-facilities -- --state=ALL --out=tmp/mfu-facilities.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { extractFloridaCommissaries } from "../engine/mfu-facilities/florida-commissary-extractor.js";
import { extractTexasCpfs } from "../engine/mfu-facilities/texas-cpf-extractor.js";
import type { MfuSupportFacilityRecord } from "../types/mfu-support-facility.js";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

async function main(): Promise<void> {
  const state = (readArg("state") ?? "ALL").toUpperCase();
  const location = readArg("location");
  const out = readArg("out");
  const limit = Number(readArg("limit"));
  const records: MfuSupportFacilityRecord[] = [];

  if (state === "FL" || state === "ALL") {
    const fl = await extractFloridaCommissaries({
      location,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    });
    console.error(`Florida: ${fl.records.length} commissaries (${fl.source})`);
    records.push(...fl.records);
  }

  if (state === "TX" || state === "ALL") {
    const tx = await extractTexasCpfs();
    console.error(`Texas: ${tx.records.length} CPF records (${tx.source})`);
    records.push(...tx.records);
  }

  if (!["FL", "TX", "ALL"].includes(state)) {
    throw new Error(`Invalid --state=${state}. Use FL, TX, or ALL.`);
  }

  const payload = {
    extractedAt: new Date().toISOString(),
    count: records.length,
    records,
  };

  const json = JSON.stringify(payload, null, 2);
  if (out) {
    const path = resolve(out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, json, "utf8");
    console.error(`Wrote ${records.length} records → ${path}`);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
