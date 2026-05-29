/** True when a lead row changed after the last successful FSA sync. */
export function leadChangedSinceSync(
  updatedAt: string | null | undefined,
  lastSyncAt: string | null,
): boolean {
  if (!lastSyncAt?.trim() || !updatedAt?.trim()) {
    return false;
  }
  const updated = new Date(updatedAt);
  const since = new Date(lastSyncAt);
  if (Number.isNaN(updated.getTime()) || Number.isNaN(since.getTime())) {
    return false;
  }
  return updated > since;
}

export function formatSyncStatusLabel(lastSyncAt: string | null): string {
  if (!lastSyncAt) {
    return "No FSA sync yet — first check imports matching takeaways";
  }
  const when = new Date(lastSyncAt);
  if (Number.isNaN(when.getTime())) {
    return "FSA sync active — checks rating changes only";
  }
  return `Last FSA check ${when.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })} — only new/changed ratings imported`;
}
