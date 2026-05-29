import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export interface SyncStatus {
  lastSyncAt: string | null;
  hasInitialSync: boolean;
  label: string;
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetchWithTimeout("/api/sync/status");
  if (!res.ok) {
    throw new Error(`Failed to load sync status (${res.status})`);
  }
  return res.json() as Promise<SyncStatus>;
}
