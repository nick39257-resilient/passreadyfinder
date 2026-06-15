/** Map free-text keyword to OSM tag filters for Overpass area search. */
export function buildOverpassTagFilters(keyword: string): string[] {
  const k = keyword.trim().toLowerCase();
  if (!k) {
    return [`nwr["name"~".",i]`];
  }

  const filters: string[] = [];

  const craftMap: Record<string, string> = {
    electrician: "electrician",
    electricians: "electrician",
    plumber: "plumber",
    plumbers: "plumber",
    builder: "builder",
    builders: "builder",
    carpenter: "carpenter",
    roofer: "roofer",
    painter: "painter",
  };

  for (const [word, craft] of Object.entries(craftMap)) {
    if (k.includes(word)) {
      filters.push(`nwr["craft"="${craft}"]`);
    }
  }

  if (k.includes("takeaway") || k.includes("take away")) {
    filters.push(`nwr["amenity"~"fast_food|restaurant",i]`);
  }
  if (k.includes("restaurant") || k.includes("cafe") || k.includes("coffee")) {
    filters.push(`nwr["amenity"~"restaurant|cafe|fast_food",i]`);
  }
  if (k.includes("salon") || k.includes("barber")) {
    filters.push(`nwr["shop"~"hairdresser|beauty",i]`);
  }

  const escaped = k.replace(/[\\.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40);
  filters.push(`nwr["name"~"${escaped}",i]`);

  return [...new Set(filters)];
}
