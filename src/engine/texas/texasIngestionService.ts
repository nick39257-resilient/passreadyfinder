import { texasProductConfig } from "../../config/product.texas.config.js";
import type { TexasLeadInput } from "../../types/texas.js";
import type { TexasRawInspectionRecord } from "./texas-ingestion-types.js";
import {
  classifyMobileVendorTier,
  defaultDshsLicenseStatus,
  isLikelyMobileVendor,
} from "./hb2844.js";
import {
  computeTexasRiskScore,
  interventionLevelForRiskScore,
} from "./texas-risk-score.js";

export type { TexasRawInspectionRecord } from "./texas-ingestion-types.js";

function pickString(raw: TexasRawInspectionRecord, keys: string[]): string | null {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return null;
}

function pickNumber(raw: TexasRawInspectionRecord, keys: string[]): number | null {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function buildExternalId(raw: TexasRawInspectionRecord, source: string): string {
  const id = pickString(raw, [
    "inspection_id",
    "inspectionid",
    "id",
    "permit_number",
    "permit_no",
    "tracking_number",
  ]);
  if (id) {
    return `${source}:${id}`;
  }
  const name = pickString(raw, ["restaurant_name", "business_name", "name", "facility_name"]) ?? "unknown";
  const date =
    pickString(raw, ["inspection_date", "date", "inspectiondate"]) ?? "nodate";
  return `${source}:${name}:${date}`.toLowerCase().replace(/\s+/g, "_").slice(0, 180);
}

/**
 * Map open-data JSON row → Texas lead (no UK FSA fields; no guardrail on category strings).
 */
export function mapOpenDataRowToTexasLead(
  raw: TexasRawInspectionRecord,
  source: string,
): TexasLeadInput | null {
  const businessName = pickString(raw, [
    "restaurant_name",
    "business_name",
    "name",
    "facility_name",
    "establishment_name",
  ]);
  if (!businessName) {
    return null;
  }

  const inspectionScore = pickNumber(raw, [
    "score",
    "inspection_score",
    "final_score",
    "total_score",
  ]);
  const demerits = pickNumber(raw, [
    "demerits",
    "total_demerits",
    "violation_points",
    "points",
  ]);
  const vehicleType = pickString(raw, [
    "vehicle_type",
    "facility_type",
    "type",
    "program",
    "establishment_type",
  ]);
  const menuDescription = pickString(raw, [
    "menu",
    "menu_description",
    "menu_type",
    "food_menu",
    "products_sold",
  ]);
  const primaryActivity = pickString(raw, [
    "primary_activity",
    "activity",
    "business_activity",
    "operation_type",
    "permit_type",
  ]);
  const facilityDescription = pickString(raw, [
    "facility_description",
    "description",
    "comments",
    "notes",
    "inspection_comments",
  ]);

  const classificationInput = {
    businessName,
    vehicleType,
    menuDescription,
    primaryActivity,
    facilityDescription,
  };

  const isMobileVendor = isLikelyMobileVendor(classificationInput);
  const vendorTier = isMobileVendor
    ? classifyMobileVendorTier(classificationInput, { assumeMobile: true })
    : null;

  const riskScore = computeTexasRiskScore({ inspectionScore, demerits });
  const interventionLevel = interventionLevelForRiskScore(
    riskScore,
    texasProductConfig.interventionThreshold,
  );

  return {
    externalId: buildExternalId(raw, source),
    source,
    region: "TEXAS",
    businessName,
    address: pickString(raw, ["address", "street_address", "location", "site_address"]),
    city: pickString(raw, ["city", "mailing_city"]),
    county: pickString(raw, ["county", "jurisdiction"]),
    zip: pickString(raw, ["zip", "zip_code", "postal_code"]),
    phone: pickString(raw, ["phone", "phone_number"]),
    email: pickString(raw, ["email", "contact_email"]),
    website: pickString(raw, [
      "website",
      "web_site",
      "url",
      "business_url",
      "site_url",
    ]),
    ownerName: pickString(raw, ["owner_name", "owner", "contact_name"]),
    inspectionScore,
    demerits,
    vehicleType,
    isMobileVendor,
    vendorTier,
    dshsLicenseStatus: defaultDshsLicenseStatus(),
    riskScore,
    interventionLevel,
    lastInspectionDate: pickString(raw, [
      "inspection_date",
      "date",
      "inspectiondate",
      "last_inspection",
    ]),
  };
}

export async function fetchTexasOpenDataFeed(options: {
  source?: string;
  limit?: number;
}): Promise<TexasRawInspectionRecord[]> {
  const sourceKey = options.source ?? texasProductConfig.ingestion.defaultSource;
  const sourceConfig = texasProductConfig.ingestion.sources[sourceKey as "austin"];
  if (!sourceConfig) {
    throw new Error(`Unknown Texas open-data source "${sourceKey}"`);
  }

  const limit = options.limit ?? texasProductConfig.ingestion.defaultLimit;
  const url = new URL(sourceConfig.url);
  if (!url.searchParams.has("$limit")) {
    url.searchParams.set("$limit", String(limit));
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Texas open-data fetch failed (${res.status}): ${url.toString()}`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Texas open-data response was not a JSON array");
  }
  return data as TexasRawInspectionRecord[];
}

export async function ingestTexasOpenData(options: {
  source?: string;
  limit?: number;
  mobileOnly?: boolean;
}): Promise<{ leads: TexasLeadInput[]; source: string }> {
  const source = options.source ?? texasProductConfig.ingestion.defaultSource;
  const rows = await fetchTexasOpenDataFeed({ source, limit: options.limit });
  const leads: TexasLeadInput[] = [];

  for (const row of rows) {
    const mapped = mapOpenDataRowToTexasLead(row, source);
    if (!mapped) {
      continue;
    }
    if (options.mobileOnly && !mapped.isMobileVendor) {
      continue;
    }
    leads.push(mapped);
  }

  return { leads, source };
}
