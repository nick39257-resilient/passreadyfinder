import { PDFParse } from "pdf-parse";
import type { MfuFacilityExtractionResult, MfuSupportFacilityRecord } from "../../types/mfu-support-facility.js";
import {
  buildFacilityRecord,
  dedupeFacilities,
  formatUsPhone,
  hasExplicitMfuServiceEvidence,
  parseServicesFromText,
  passesTexasCpfTaxonomy,
  splitStreetCityZip,
} from "./shared.js";

const SA_COMMISSARY_PDF_URL =
  process.env.TEXAS_SA_COMMISSARY_PDF_URL?.trim() ||
  "https://www.sa.gov/files/assets/main/v/2/samhd/documents/commissarylist.pdf";

const AUSTIN_INSPECTIONS_URL =
  process.env.TEXAS_AUSTIN_INSPECTIONS_URL?.trim() ||
  "https://data.austintexas.gov/resource/ecmv-9xxi.json";

type SaParsedFacility = {
  name: string;
  addressLine: string;
  phone: string | null;
  servicesText: string | null;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Parse San Antonio Metro Health commissary / CPF PDF (authority-published MFU list).
 * PDF uses a 3-column tab layout; each column stack becomes one facility record.
 */
export function parseSanAntonioCommissaryPdfText(text: string): SaParsedFacility[] {
  const startIdx = text.indexOf("APPROVED COMMISSARIES");
  const body = startIdx >= 0 ? text.slice(startIdx) : text;
  const lines = body
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const COLS = 3;
  const stacks: string[][] = Array.from({ length: COLS }, () => []);
  const facilities: SaParsedFacility[] = [];
  const phoneRe = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

  function flushColumn(col: string[]): void {
    if (col.length === 0) {
      return;
    }

    const servicesLine = col.find((line) => /Services\s*[–-]/i.test(line)) ?? null;
    const servicesText = servicesLine?.replace(/^.*Services\s*[–-]\s*/i, "").trim() ?? null;
    const phoneLine = col.find((line) => phoneRe.test(line)) ?? null;
    const phone = phoneLine?.match(phoneRe)?.[0] ?? null;
    const addressLine = col.find((line) => /,\s*TX\s*\d{5}/i.test(line)) ?? null;
    const streetLine =
      col.find((line) => /\d/.test(line) && !/,\s*TX\s*\d{5}/i.test(line) && !phoneRe.test(line)) ??
      null;
    const nameLine =
      col.find(
        (line) =>
          line !== servicesLine &&
          line !== phoneLine &&
          line !== addressLine &&
          line !== streetLine &&
          !/approved|please be sure/i.test(line),
      ) ?? null;

    if (!nameLine || !addressLine || !phone) {
      return;
    }

    const address = streetLine
      ? `${streetLine}, ${addressLine}`
      : addressLine;

    facilities.push({
      name: normalizeWhitespace(nameLine.replace(/\(County\)/gi, "").trim()),
      addressLine: normalizeWhitespace(address.replace(/\(County\)/gi, "").trim()),
      phone,
      servicesText,
    });
  }

  for (const line of lines) {
    if (/^APPROVED|^COMMISSARY \/ CENTRAL|^Please be sure/i.test(line)) {
      continue;
    }

    const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    if (parts.length === 1) {
      stacks[0].push(parts[0]!);
      continue;
    }

    for (let i = 0; i < COLS; i++) {
      const cell = parts[i];
      if (!cell) {
        continue;
      }
      stacks[i].push(cell);
      if (/Services\s*[–-]/i.test(cell)) {
        flushColumn(stacks[i]);
        stacks[i] = [];
      }
    }
  }

  for (const col of stacks) {
    if (col.length > 0) {
      flushColumn(col);
    }
  }

  return facilities;
}

function parseLooseTexasAddress(line: string): {
  street: string;
  city: string;
  zip: string;
  county: string;
} | null {
  const withoutCounty = line.replace(/\(County\)/gi, "").trim();
  const zipMatch = withoutCounty.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch?.[1] ?? "";
  const beforeZip = zipMatch ? withoutCounty.slice(0, zipMatch.index).trim() : withoutCounty;

  const cityStateMatch = beforeZip.match(/,\s*([A-Za-z .'-]+),?\s*TX\s*$/i);
  let city = "San Antonio";
  let street = beforeZip;
  if (cityStateMatch) {
    city = cityStateMatch[1].trim();
    street = beforeZip.slice(0, cityStateMatch.index).replace(/,\s*$/, "").trim();
  } else {
    const parts = beforeZip.split(",");
    if (parts.length >= 2) {
      street = parts.slice(0, -1).join(",").trim();
      city = parts[parts.length - 1]!.trim();
    }
  }

  if (!street || !zip) {
    return null;
  }

  return {
    street,
    city,
    zip,
    county: "Bexar",
  };
}

async function extractSanAntonioCpfList(): Promise<MfuSupportFacilityRecord[]> {
  const response = await fetch(SA_COMMISSARY_PDF_URL, {
    headers: { "User-Agent": "PassReadyFinder/1.0 (mfu-facility-extract)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`San Antonio commissary PDF fetch failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  await parser.destroy();
  const facilities = parseSanAntonioCommissaryPdfText(textResult.text);
  const records: MfuSupportFacilityRecord[] = [];

  for (const facility of facilities) {
    const parsedAddress = parseLooseTexasAddress(facility.addressLine);
    if (!parsedAddress) {
      continue;
    }
    const address = splitStreetCityZip({
      street: parsedAddress.street,
      city: parsedAddress.city,
      zip: parsedAddress.zip,
      county: parsedAddress.county,
      state: "TX",
    });
    if (!address) {
      continue;
    }

    records.push(
      buildFacilityRecord({
        state: "TX",
        facilityName: facility.name,
        legalTerm: "Central Preparation Facility",
        governingAuthority: "San Antonio Metropolitan Health District",
        contact: { phone: formatUsPhone(facility.phone) },
        address,
        services: parseServicesFromText(facility.servicesText),
      }),
    );
  }

  return records;
}

type AustinInspectionRow = Record<string, string | null | undefined>;

async function extractAustinCpfCandidates(limit = 5000): Promise<MfuSupportFacilityRecord[]> {
  const url = `${AUSTIN_INSPECTIONS_URL}?$limit=${Math.min(limit, 50000)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "PassReadyFinder/1.0 (mfu-facility-extract)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Austin inspections fetch failed: ${response.status}`);
  }

  const rows = (await response.json()) as AustinInspectionRow[];
  const records: MfuSupportFacilityRecord[] = [];

  for (const row of rows) {
    const name = String(row.restaurant_name ?? row.facility_name ?? "").trim();
    const process = String(row.process_description ?? "").trim();
    const blob = `${name} ${process}`;
    if (!passesTexasCpfTaxonomy(blob)) {
      continue;
    }
    if (!hasExplicitMfuServiceEvidence(blob)) {
      continue;
    }

    const addressRaw = String(row.address ?? "").trim();
    const zip = String(row.zip_code ?? "").trim();
    const city = "Austin";
    const address = splitStreetCityZip({
      street: addressRaw,
      city,
      zip,
      county: "Travis",
      state: "TX",
    });
    if (!address) {
      continue;
    }

    records.push(
      buildFacilityRecord({
        state: "TX",
        facilityName: name,
        legalTerm: "Central Preparation Facility",
        governingAuthority: "Austin Public Health",
        licenseNumber: row.facility_id ? String(row.facility_id) : null,
        address,
        servicesText: process,
      }),
    );
  }

  return records;
}

export type TexasCpfExtractOptions = {
  includeSanAntonio?: boolean;
  includeAustinOpenData?: boolean;
  austinScanLimit?: number;
};

/**
 * Extract Texas Central Preparation Facilities from authority-published lists and
 * open-data sources filtered to CPF/commissary taxonomy with explicit MFU evidence.
 */
export async function extractTexasCpfs(
  options: TexasCpfExtractOptions = {},
): Promise<MfuFacilityExtractionResult> {
  const includeSa = options.includeSanAntonio !== false;
  const includeAustin = options.includeAustinOpenData !== false;
  const records: MfuSupportFacilityRecord[] = [];
  const sources: string[] = [];
  let skipped = 0;

  if (includeSa) {
    try {
      const saRecords = await extractSanAntonioCpfList();
      sources.push(SA_COMMISSARY_PDF_URL);
      records.push(...saRecords);
    } catch (err) {
      console.warn(
        "San Antonio CPF PDF extract failed:",
        err instanceof Error ? err.message : err,
      );
      skipped++;
    }
  }

  if (includeAustin) {
    try {
      const austinRecords = await extractAustinCpfCandidates(options.austinScanLimit ?? 5000);
      sources.push(AUSTIN_INSPECTIONS_URL);
      records.push(...austinRecords);
    } catch (err) {
      console.warn(
        "Austin CPF open-data extract failed:",
        err instanceof Error ? err.message : err,
      );
      skipped++;
    }
  }

  return {
    extractedAt: new Date().toISOString(),
    source: sources.join(" | ") || "none",
    records: dedupeFacilities(records),
    skipped,
  };
}
