import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

export async function geocodeSearchArea(label: string): Promise<GeocodeResult | null> {
  const q = label.trim();
  if (!q) {
    return null;
  }
  const res = await fetchWithTimeout(`/api/geocode?q=${encodeURIComponent(q)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Geocode failed (${res.status})`);
  }
  return res.json() as Promise<GeocodeResult>;
}
