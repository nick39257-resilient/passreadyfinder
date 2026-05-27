export type SystemPulseState =
  | "idle"
  | "scraping"
  | "drafting"
  | "needs_review"
  | "error";

export interface SystemStatusFeedItem {
  id: number;
  message: string;
  level: "info" | "error";
  source: string;
  createdAt: string;
}

export interface DailySendQuota {
  sentToday: number;
  cap: number;
  remaining: number;
}

export interface SystemStatusResponse {
  pulse: SystemPulseState;
  pulseLabel: string;
  errorMessage: string | null;
  feed: SystemStatusFeedItem[];
  needsReviewCount: number;
  complianceTip: string;
  dailyQuota: DailySendQuota;
  dailyCapResetDescription: string;
}

export async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  const res = await fetch("/api/status");
  if (!res.ok) {
    throw new Error(`Failed to load system status (${res.status})`);
  }
  return res.json() as Promise<SystemStatusResponse>;
}
