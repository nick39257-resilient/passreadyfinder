export interface FunnelStats {
  identified: number;
  drafted: number;
  approved: number;
  converted: number;
}

export async function fetchFunnel(): Promise<FunnelStats> {
  const res = await fetch("/api/funnel");
  if (!res.ok) {
    throw new Error(`Failed to load funnel (${res.status})`);
  }
  return res.json() as Promise<FunnelStats>;
}
