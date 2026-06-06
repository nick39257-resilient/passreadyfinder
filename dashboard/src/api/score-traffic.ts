import { authHeaders } from "../lib/auth-headers.js";
import { getControlSecret } from "../lib/control-secret.js";

export interface ScoreTrafficStats {
  uk: number;
  us: number;
  total: number;
}

export async function fetchScoreTrafficStats(
  secret?: string,
): Promise<ScoreTrafficStats> {
  const res = await fetch("/api/score-traffic/stats", {
    headers: authHeaders(secret ?? getControlSecret()),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Score traffic stats failed (${res.status})`);
  }
  return res.json() as Promise<ScoreTrafficStats>;
}
