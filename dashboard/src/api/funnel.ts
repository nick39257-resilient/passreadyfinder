export interface FunnelStats {
  identified: number;
  drafted: number;
  approved: number;
  converted: number;
}

import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export async function fetchFunnel(): Promise<FunnelStats> {
  const res = await fetchWithTimeout("/api/funnel");
  if (!res.ok) {
    throw new Error(`Failed to load funnel (${res.status})`);
  }
  return res.json() as Promise<FunnelStats>;
}
