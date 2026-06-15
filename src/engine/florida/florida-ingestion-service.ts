import { floridaProductConfig } from "../../config/product.florida.config.js";
import type { FloridaLeadInput } from "../../types/florida.js";
import { floridaDistrictUrlsForLocation } from "./florida-district-sources.js";
import {
  floridaLocationIsStatewide,
  floridaLocationSearchTokens,
} from "./florida-location-tokens.js";
import { csvRowsToObjects, parseCsvText } from "./florida-csv-parser.js";
import {
  computeFloridaRiskScore,
  isFloridaCriticalRisk,
} from "./florida-risk-score.js";

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) {
      return v.trim();
    }
  }
  return null;
}

function pickNum(row: Record<string, string>, keys: string[]): number | null {
  const raw = pick(row, keys);
  if (!raw) {
    return null;
  }
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function locationSearchTokens(location: string): string[] {
  return floridaLocationSearchTokens(location);
}

function matchesLocationFilter(
  row: Record<string, string>,
  location: string,
): boolean {
  const tokens = locationSearchTokens(location);
  if (tokens.length === 0) {
    return true;
  }

  const city = (pick(row, ["location_city", "city", "location_city_name"]) ?? "").toLowerCase();
  const county = (pick(row, ["county_name", "county", "location_county"]) ?? "").toLowerCase();

  return tokens.some((token) => {
    const normalized = token.replace(/\./g, "").replace(/\s+/g, " ");
    const cityNorm = city.replace(/\./g, "").replace(/\s+/g, " ");
    const countyNorm = county.replace(/\./g, "").replace(/\s+/g, " ");
    return (
      cityNorm.includes(normalized) ||
      countyNorm.includes(normalized) ||
      normalized.includes(cityNorm)
    );
  });
}

function mergeFloridaLead(
  existing: FloridaLeadInput,
  next: FloridaLeadInput,
): FloridaLeadInput {
  if (next.riskScore > existing.riskScore) {
    return next;
  }
  if (next.riskScore < existing.riskScore) {
    return existing;
  }
  const existingDate = existing.lastInspectionDate ?? "";
  const nextDate = next.lastInspectionDate ?? "";
  return nextDate >= existingDate ? next : existing;
}

export function mapDbprRowToFloridaLead(
  row: Record<string, string>,
  source: string,
): FloridaLeadInput | null {
  const businessName = pick(row, [
    "business_name",
    "business_(dba-does_business_as)_name",
    "licensee_name",
    "dba_name",
    "location_name",
    "name",
  ]);
  if (!businessName) {
    return null;
  }

  const licenseNumber = pick(row, ["license_number", "license_num", "license_no"]);
  const externalId = licenseNumber
    ? `${source}:lic:${licenseNumber}`
    : `${source}:${businessName}:${pick(row, ["location_address", "address"]) ?? "na"}`
        .toLowerCase()
        .replace(/\s+/g, "_")
        .slice(0, 180);

  const priorityViolations = pickNum(row, [
    "number_of_high_priority_violations",
    "number_of_critical_violations",
    "number_of_priority_violations",
    "priority_violations",
    "priority_violation_count",
    "violations_priority",
  ]);

  const inspectionScore = pickNum(row, [
    "inspection_score",
    "number_of_total_violations",
  ]);

  const riskLevel = pick(row, ["risk_level", "risk_level_identifier", "risk"]);

  const riskScore = computeFloridaRiskScore({
    priorityViolations,
    inspectionScore,
    riskLevel,
  });

  return {
    externalId,
    source,
    region: "FLORIDA",
    businessName,
    address: pick(row, ["location_address", "address", "facility_address"]),
    city: pick(row, ["location_city", "city"]),
    county: pick(row, ["county_name", "county"]),
    zip: pick(row, ["location_zip_code", "location_zip", "zip", "zip_code"]),
    phone: pick(row, ["phone", "telephone", "location_phone"]),
    email: pick(row, ["email", "contact_email"]),
    licenseNumber,
    licenseType: pick(row, ["license_type", "license_type_code"]),
    riskLevel,
    inspectionScore,
    priorityViolations,
    lastInspectionDate: pick(row, [
      "inspection_date",
      "last_inspection_date",
      "date_of_inspection",
    ]),
    riskScore,
    status: isFloridaCriticalRisk(riskScore, floridaProductConfig.criticalRiskThreshold)
      ? "critical"
      : "new",
  };
}

export async function fetchFloridaDbprCsv(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PassReadyFinder/1.0 (contact@passready.co.uk)",
      Accept: "text/csv,text/plain,*/*",
    },
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Florida DBPR fetch failed ${response.status}`);
  }

  return response.text();
}

function resolveFloridaDataUrls(input: {
  location: string;
  dataUrl?: string;
}): string[] {
  if (input.dataUrl?.trim()) {
    return [input.dataUrl.trim()];
  }

  // City/county searches always use the correct DBPR district CSV(s).
  if (!floridaLocationIsStatewide(input.location)) {
    return floridaDistrictUrlsForLocation(input.location);
  }

  const envUrl =
    process.env.FLORIDA_DBPR_DATA_URL?.trim() ||
    process.env.FLORIDA_DBPR_LICENSE_URL?.trim();
  if (envUrl) {
    return [envUrl];
  }

  return floridaDistrictUrlsForLocation(input.location);
}

export async function ingestFloridaDbprData(input: {
  location: string;
  limit?: number;
  dataUrl?: string;
}): Promise<{ leads: FloridaLeadInput[]; source: string }> {
  const urls = resolveFloridaDataUrls(input);
  const limit = input.limit ?? floridaProductConfig.ingestion.defaultLimit;
  const byLicense = new Map<string, FloridaLeadInput>();
  const sources: string[] = [];

  for (const url of urls) {
    const text = await fetchFloridaDbprCsv(url);
    const rows = csvRowsToObjects(parseCsvText(text));
    const source = `florida_dbpr:${url.split("/").pop() ?? "extract"}`;
    sources.push(source);

    for (const row of rows) {
      if (!matchesLocationFilter(row, input.location)) {
        continue;
      }
      const lead = mapDbprRowToFloridaLead(row, source);
      if (!lead) {
        continue;
      }
      const key = lead.licenseNumber ?? lead.externalId;
      const existing = byLicense.get(key);
      byLicense.set(key, existing ? mergeFloridaLead(existing, lead) : lead);
      if (byLicense.size >= limit) {
        break;
      }
    }

    if (byLicense.size >= limit) {
      break;
    }

    if (urls.length > 1 && floridaProductConfig.ingestion.requestDelayMs > 0) {
      await new Promise((r) => setTimeout(r, floridaProductConfig.ingestion.requestDelayMs));
    }
  }

  const leads = [...byLicense.values()];

  return {
    leads,
    source: sources.length === 1 ? sources[0]! : `florida_dbpr:${sources.length}_districts`,
  };
}
