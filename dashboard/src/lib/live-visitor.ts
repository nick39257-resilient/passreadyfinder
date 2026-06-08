const LIVE_VISITOR_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseSqliteUtc(iso: string): number {
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

/** True when the lead opened the SafeScore landing page within the last 24 hours. */
export function isLiveVisitor(lastPreviewedAt: string | null | undefined): boolean {
  if (!lastPreviewedAt?.trim()) {
    return false;
  }
  const ageMs = Date.now() - parseSqliteUtc(lastPreviewedAt);
  return ageMs >= 0 && ageMs < LIVE_VISITOR_WINDOW_MS;
}

export function liveVisitorSortKey(lastPreviewedAt: string | null | undefined): number {
  return isLiveVisitor(lastPreviewedAt) ? 1 : 0;
}
