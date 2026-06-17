import { fetchFloridaDbprCsv } from "../florida/florida-ingestion-service.js";
import { csvRowsToObjects, parseCsvText } from "../florida/florida-csv-parser.js";
import { FLORIDA_DBPR_DISTRICT_CSV, floridaDistrictUrlsForLocation } from "../florida/florida-district-sources.js";
import { floridaLocationSearchTokens } from "../florida/florida-location-tokens.js";
import type { MfuFacilityExtractionResult } from "../../types/mfu-support-facility.js";
import {
  buildFacilityRecord,
  dedupeFacilities,
  hasExplicitMfuServiceEvidence,
  passesFloridaCommissaryTaxonomy,
  splitStreetCityZip,
} from "./shared.js";

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) {
      return v.trim();
    }
  }
  return null;
}

function matchesLocation(row: Record<string, string>, location?: string): boolean {
  if (!location?.trim()) {
    return true;
  }
  const tokens = floridaLocationSearchTokens(location);
  if (tokens.length === 0) {
    return true;
  }
  const city = (pick(row, ["location_city", "city"]) ?? "").toLowerCase();
  const county = (pick(row, ["county_name", "county"]) ?? "").toLowerCase();
  return tokens.some((token) => {
    const normalized = token.replace(/\./g, "").replace(/\s+/g, " ");
    return (
      city.includes(normalized) ||
      county.includes(normalized) ||
      normalized.includes(city.replace(/\./g, ""))
    );
  });
}

function mapFloridaRow(row: Record<string, string>): MfuFacilityExtractionResult["records"][number] | null {
  const businessName = pick(row, [
    "business_(dba-does_business_as)_name",
    "business_name",
    "licensee_name",
    "dba_name",
  ]);
  if (!businessName) {
    return null;
  }

  const taxonomyBlob = [businessName, pick(row, ["license_type_code", "license_type"])].filter(Boolean).join(" ");
  if (!passesFloridaCommissaryTaxonomy(taxonomyBlob)) {
    return null;
  }

  if (!hasExplicitMfuServiceEvidence(taxonomyBlob, { authorityListed: true })) {
    return null;
  }

  const address = splitStreetCityZip({
    street: pick(row, ["location_address", "address", "location_street_address_line_1"]),
    city: pick(row, ["location_city", "city"]),
    zip: pick(row, ["location_zip_code", "zip", "zip_code"]),
    county: pick(row, ["county_name", "county"]),
    state: "FL",
  });
  if (!address) {
    return null;
  }

  const countyName = pick(row, ["county_name", "county"]);
  const governingAuthority = countyName
    ? `Florida DBPR (${countyName} County)`
    : "Florida DBPR";

  return buildFacilityRecord({
    state: "FL",
    facilityName: businessName,
    legalTerm: "Commissary",
    governingAuthority,
    licenseNumber: pick(row, ["license_number", "license_num"]),
    contact: {
      phone: pick(row, ["phone", "primary_telephone_number", "location_phone"]),
      email: pick(row, ["email", "contact_email"]),
    },
    address,
  });
}

export type FloridaCommissaryExtractOptions = {
  location?: string;
  districts?: number[];
  limit?: number;
};

/**
 * Extract Florida commissaries from DBPR public food-service inspection CSV extracts.
 * Taxonomy: business name must include "Commissary" (or commissary services/kitchen).
 * DBPR does not publish a standalone commissary license type — commissaries are licensed
 * food service establishments that serve MFDVs (included when commissary is explicit in name).
 */
export async function extractFloridaCommissaries(
  options: FloridaCommissaryExtractOptions = {},
): Promise<MfuFacilityExtractionResult> {
  const urls = options.districts?.length
    ? options.districts
        .map((district) => FLORIDA_DBPR_DISTRICT_CSV[district as keyof typeof FLORIDA_DBPR_DISTRICT_CSV])
        .filter(Boolean)
    : options.location?.trim()
      ? floridaDistrictUrlsForLocation(options.location)
      : Object.values(FLORIDA_DBPR_DISTRICT_CSV);

  const limit = options.limit ?? 500;
  const records: MfuFacilityExtractionResult["records"] = [];
  let skipped = 0;
  const sources: string[] = [];

  for (const url of urls) {
    sources.push(url);
    const text = await fetchFloridaDbprCsv(url);
    const rows = csvRowsToObjects(parseCsvText(text));

    for (const row of rows) {
      if (!matchesLocation(row, options.location)) {
        continue;
      }
      const mapped = mapFloridaRow(row);
      if (!mapped) {
        if (passesFloridaCommissaryTaxonomy(JSON.stringify(row))) {
          skipped++;
        }
        continue;
      }
      records.push(mapped);
      if (records.length >= limit) {
        break;
      }
    }
    if (records.length >= limit) {
      break;
    }
  }

  return {
    extractedAt: new Date().toISOString(),
    source: sources.length === 1 ? sources[0]! : `florida_dbpr:${sources.length}_districts`,
    records: dedupeFacilities(records),
    skipped,
  };
}
