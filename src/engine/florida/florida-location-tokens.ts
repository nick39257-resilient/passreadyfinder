/** Shared city/county tokens for Florida DBPR ingest + list filters. */
export function floridaLocationSearchTokens(location: string): string[] {
  const raw = location.trim().toLowerCase();
  if (!raw || raw === "florida" || raw === "fl") {
    return [];
  }

  const parts = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "fl" && s !== "florida" && s !== "usa" && s !== "us");

  const tokens = new Set<string>(parts.length > 0 ? parts : [raw]);

  const cityToCounty: Record<string, string[]> = {
    orlando: ["orange"],
    kissimmee: ["osceola"],
    "winter park": ["orange"],
    sanford: ["seminole"],
    tampa: ["hillsborough"],
    miami: ["dade", "miami-dade"],
    hialeah: ["dade"],
    jacksonville: ["duval"],
    gainesville: ["alachua"],
    tallahassee: ["leon"],
    "fort lauderdale": ["broward"],
    hollywood: ["broward"],
    "st. petersburg": ["pinellas"],
    "st petersburg": ["pinellas"],
    clearwater: ["pinellas"],
    naples: ["collier"],
    sarasota: ["sarasota"],
    "miami-dade": ["dade"],
  };

  for (const token of [...tokens]) {
    const counties = cityToCounty[token];
    if (counties) {
      for (const county of counties) {
        tokens.add(county);
      }
    }
  }

  return [...tokens];
}

export function floridaLocationIsStatewide(location: string): boolean {
  const raw = location.trim().toLowerCase();
  return !raw || raw === "florida" || raw === "fl";
}
