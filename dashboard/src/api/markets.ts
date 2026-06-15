import { authHeaders } from "../lib/auth-headers.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";
import { getControlSecret } from "../lib/control-secret.js";
import { pollJobUntilDone } from "../lib/job-poll.js";

export type MarketMode = "regulated" | "open";

export interface MarketDefinition {
  id: string;
  name: string;
  mode: MarketMode;
  region: string;
  description: string;
  status: "active" | "planned";
  supportsKeyword: boolean;
  locationHint: string;
  dataLane: string;
  legacyJobType?: string;
}

export async function fetchMarkets(): Promise<MarketDefinition[]> {
  const res = await fetchWithTimeout("/api/markets");
  if (!res.ok) {
    throw new Error("Failed to load markets");
  }
  const body = (await res.json()) as { markets: MarketDefinition[] };
  return body.markets;
}

export async function startMarketFind(input: {
  marketId: string;
  location: string;
  keyword?: string;
  mode?: MarketMode;
  mobileOnly?: boolean;
}): Promise<string> {
  const res = await fetchWithTimeout("/api/markets/find", {
    method: "POST",
    headers: authHeaders(getControlSecret()),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to start scan");
  }
  const body = (await res.json()) as { jobId: string };
  return body.jobId;
}

export async function runMarketFindAndWait(input: {
  marketId: string;
  location: string;
  keyword?: string;
  mode?: MarketMode;
  onProgress?: (message: string) => void;
}): Promise<unknown> {
  const jobId = await startMarketFind(input);
  const { promise } = pollJobUntilDone(jobId, (job) => {
    if (job.progress) {
      input.onProgress?.(job.progress);
    }
  });
  const job = await promise;
  return job.result;
}

export function exportLeadsCsv(
  rows: Array<Record<string, string | number | null | undefined>>,
  filename: string,
): void {
  if (rows.length === 0) {
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "");
          return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
        })
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
