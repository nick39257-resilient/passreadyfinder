import { OSM_USER_AGENT } from "../enrich/osm-enricher.js";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function geocodeLocation(label: string): Promise<GeocodeResult | null> {
  const q = label.trim();
  if (!q) {
    return null;
  }

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": OSM_USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Nominatim error ${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;

  const hit = rows[0];
  if (!hit?.lat || !hit?.lon) {
    return null;
  }

  const latitude = Number(hit.lat);
  const longitude = Number(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    displayName: hit.display_name ?? q,
  };
}
