import { getSetting, setSetting } from "../store/outreach-migrations.js";

export const LAST_SYNC_TIMESTAMP_KEY = "last_sync_timestamp";

export async function getLastSyncTimestamp(): Promise<string | null> {
  return getSetting(LAST_SYNC_TIMESTAMP_KEY);
}

export async function setLastSyncTimestamp(iso: string): Promise<void> {
  await setSetting(LAST_SYNC_TIMESTAMP_KEY, iso);
}

/** True when establishment should be processed on this delta run */
export function establishmentChangedSince(
  ratingDate: string | null | undefined,
  lastSyncTimestamp: string | null,
): boolean {
  if (!lastSyncTimestamp) {
    return true;
  }
  if (!ratingDate?.trim()) {
    return true;
  }

  const updated = new Date(ratingDate);
  const since = new Date(lastSyncTimestamp);
  if (Number.isNaN(updated.getTime()) || Number.isNaN(since.getTime())) {
    return true;
  }

  return updated > since;
}
