export type AutopilotEngineStatus = "Idle" | "Processing";

export interface AutopilotStatusMetadata {
  lastRunTimestamp: string | null;
  engineStatus: AutopilotEngineStatus;
  totalFormsSubmitted: number;
}

export interface AutopilotStatusResponse {
  metadata: AutopilotStatusMetadata;
}

export function parseSqliteUtcTimestamp(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  if (trimmed.includes("T")) {
    return new Date(trimmed.endsWith("Z") ? trimmed : `${trimmed}Z`).getTime();
  }
  return new Date(`${trimmed.replace(" ", "T")}Z`).getTime();
}

export function formatAutopilotRelativeTime(value: string | null): string {
  if (!value?.trim()) return "—";
  const at = parseSqliteUtcTimestamp(value);
  if (!Number.isFinite(at)) return "—";
  const deltaMs = Date.now() - at;
  if (deltaMs < 60_000) return "just now";
  const mins = Math.round(deltaMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
