/** DBPR food service inspection extracts by district (public records). */
export const FLORIDA_DBPR_DISTRICT_CSV: Record<number, string> = {
  1: "https://www2.myfloridalicense.com/sto/file_download/extracts/1fdinspi.csv",
  2: "https://www2.myfloridalicense.com/sto/file_download/extracts/2fdinspi.csv",
  3: "https://www2.myfloridalicense.com/sto/file_download/extracts/3fdinspi.csv",
  4: "https://www2.myfloridalicense.com/sto/file_download/extracts/4fdinspi.csv",
  5: "https://www2.myfloridalicense.com/sto/file_download/extracts/5fdinspi.csv",
  6: "https://www2.myfloridalicense.com/sto/file_download/extracts/6fdinspi.csv",
  7: "https://www2.myfloridalicense.com/sto/file_download/extracts/7fdinspi.csv",
};

/**
 * DBPR licensing districts (verified against county columns in fdinspi extracts).
 * D1 Miami-Dade, D2 Broward/Palm Beach, D3 Tampa Bay, D4 Central FL (Orlando),
 * D5 Jacksonville/North, D6 Panhandle, D7 Southwest Gulf.
 */
const LOCATION_DISTRICT_HINTS: Array<{ pattern: RegExp; districts: number[] }> = [
  { pattern: /\b(miami|hialeah|miami-dade|dade|key west|homestead)\b/i, districts: [1] },
  { pattern: /\b(monroe)\b/i, districts: [1] },
  { pattern: /\b(fort lauderdale|hollywood|pompano|boca|broward|palm beach)\b/i, districts: [2] },
  { pattern: /\b(tampa|st\.?\s*petersburg|clearwater|bradenton|hillsborough|pinellas|polk|pasco)\b/i, districts: [3] },
  {
    pattern:
      /\b(orlando|kissimmee|winter park|sanford|deltona|daytona|melbourne|cocoa|orange|osceola|seminole|volusia|brevard|lake|st\.?\s*lucie)\b/i,
    districts: [4],
  },
  { pattern: /\b(jacksonville|gainesville|tallahassee|st\.?\s*augustine|duval|marion|alachua)\b/i, districts: [5] },
  { pattern: /\b(pensacola|panama city|tallahassee|destin|escambia|okaloosa|bay county)\b/i, districts: [6] },
  {
    pattern:
      /\b(fort myers|naples|cape coral|sarasota|venice|port charlotte|lee|collier|manatee|charlotte)\b/i,
    districts: [7],
  },
];

export function floridaDistrictUrlsForLocation(location: string): string[] {
  const needle = location.trim().toLowerCase();
  if (!needle || needle === "florida" || needle === "fl") {
    return Object.values(FLORIDA_DBPR_DISTRICT_CSV);
  }

  for (const hint of LOCATION_DISTRICT_HINTS) {
    if (hint.pattern.test(needle)) {
      return hint.districts.map((d) => FLORIDA_DBPR_DISTRICT_CSV[d]);
    }
  }

  return Object.values(FLORIDA_DBPR_DISTRICT_CSV);
}

export function defaultFloridaDataUrl(): string {
  return FLORIDA_DBPR_DISTRICT_CSV[4];
}
