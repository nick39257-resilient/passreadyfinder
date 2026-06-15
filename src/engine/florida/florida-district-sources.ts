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

const LOCATION_DISTRICT_HINTS: Array<{ pattern: RegExp; districts: number[] }> = [
  { pattern: /\b(orlando|kissimmee|lakeland|winter park|sanford|deltona)\b/i, districts: [3] },
  { pattern: /\b(orange|osceola|seminole|volusia|lake|marion|sumter)\b/i, districts: [3] },
  { pattern: /\b(miami|hialeah|fort lauderdale|hollywood|pompano|boca)\b/i, districts: [7] },
  { pattern: /\b(broward|palm beach|miami-dade|monroe)\b/i, districts: [7] },
  { pattern: /\b(tampa|st\.?\s*petersburg|clearwater|bradenton|sarasota)\b/i, districts: [5] },
  { pattern: /\b(hillsborough|pinellas|manatee|sarasota|pasco|hernando|citrus)\b/i, districts: [5] },
  { pattern: /\b(jacksonville|gainesville|tallahassee|pensacola)\b/i, districts: [1, 2] },
  { pattern: /\b(cocoa|melbourne|palm bay|daytona|cocoa beach)\b/i, districts: [4] },
  { pattern: /\b(brevard|flagler|volusia)\b/i, districts: [4] },
  { pattern: /\b(fort myers|naples|cape coral|port charlotte)\b/i, districts: [6] },
  { pattern: /\b(lee|collier|charlotte|sarasota|manatee)\b/i, districts: [6] },
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

  // Unknown city — search all districts so any Florida location can match.
  return Object.values(FLORIDA_DBPR_DISTRICT_CSV);
}

export function defaultFloridaDataUrl(): string {
  return FLORIDA_DBPR_DISTRICT_CSV[3];
}
