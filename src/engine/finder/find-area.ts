import { fetchAuthorities, resolveLocalAuthorityIdLoose } from "./authorities.js";

const UK_ALIASES = new Set([
  "uk",
  "united kingdom",
  "great britain",
  "britain",
  "gb",
  "england",
  "wales",
  "scotland",
]);

/** County / region bundles — expands one search label to multiple FSA local authorities. */
const COUNTY_BUNDLES: Record<string, string[]> = {
  lancashire: [
    "Preston",
    "South Ribble",
    "Chorley",
    "Lancaster City",
    "Fylde",
    "Wyre",
    "Ribble Valley",
    "Pendle",
    "Burnley",
    "Hyndburn",
    "Rossendale",
    "West Lancashire",
    "Blackpool",
    "Blackburn with Darwen",
  ],
};

export function isUkWideArea(area: string): boolean {
  return UK_ALIASES.has(area.trim().toLowerCase());
}

export async function resolveAuthoritiesForFind(
  areaName: string,
): Promise<Array<{ id: number; name: string }>> {
  if (isUkWideArea(areaName)) {
    const authorities = await fetchAuthorities();
    return authorities
      .map((a) => ({ id: a.LocalAuthorityId, name: a.Name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const bundle =
    COUNTY_BUNDLES[areaName.trim().toLowerCase()] ?? [areaName.trim()];
  const resolved: Array<{ id: number; name: string }> = [];
  for (const name of bundle) {
    const match = await resolveLocalAuthorityIdLoose(name);
    resolved.push({ id: match.id, name: match.name });
  }
  return resolved;
}
