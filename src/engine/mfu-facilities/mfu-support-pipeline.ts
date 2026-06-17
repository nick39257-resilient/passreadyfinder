import type { MarketSearchParams } from "../../markets/types.js";
import type { MfuSupportFacilityRecord } from "../../types/mfu-support-facility.js";
import { runMigrations } from "../store/db.js";
import { upsertMfuSupportFacility } from "../store/mfu-support-repository.js";
import { extractFloridaCommissaries } from "./florida-commissary-extractor.js";
import { extractTexasCpfs } from "./texas-cpf-extractor.js";

export type MfuSupportStateScope = "TX" | "FL" | "ALL";

export function resolveMfuSupportStateScope(params: MarketSearchParams): MfuSupportStateScope {
  const keyword = params.keyword?.trim().toUpperCase();
  if (keyword === "TX" || keyword === "FL") {
    return keyword;
  }

  const location = params.location.trim().toLowerCase();
  if (/\bflorida\b|\b,\s*fl\b/.test(location)) {
    return "FL";
  }
  if (/\btexas\b|\b,\s*tx\b/.test(location)) {
    return "TX";
  }
  return "ALL";
}

export async function runMfuSupportFindPipeline(
  params: MarketSearchParams,
  onProgress?: (message: string) => void | Promise<void>,
): Promise<{
  fetched: number;
  stored: number;
  texasCount: number;
  floridaCount: number;
  scope: MfuSupportStateScope;
}> {
  await runMigrations();
  const scope = resolveMfuSupportStateScope(params);
  const records: MfuSupportFacilityRecord[] = [];

  if (scope === "FL" || scope === "ALL") {
    await onProgress?.(`Extracting Florida commissaries for ${params.location}…`);
    const fl = await extractFloridaCommissaries({
      location: params.location,
      limit: params.limit ?? 500,
    });
    records.push(...fl.records);
  }

  if (scope === "TX" || scope === "ALL") {
    await onProgress?.("Extracting Texas Central Preparation Facilities…");
    const tx = await extractTexasCpfs();
    records.push(...tx.records);
  }

  let stored = 0;
  for (const record of records) {
    await upsertMfuSupportFacility(record);
    stored++;
  }

  return {
    fetched: records.length,
    stored,
    texasCount: records.filter((r) => r.state === "TX").length,
    floridaCount: records.filter((r) => r.state === "FL").length,
    scope,
  };
}
