import { authHeaders } from "../lib/auth-headers.js";

export interface SendPreviewResponse {
  approvedCount: number;
  sendableCount: number;
  confirmToken: string | null;
  sendLocked: boolean;
  reason?: string | null;
  dailyCapReached?: boolean;
  dailyQuota?: {
    sentToday: number;
    cap: number;
    remaining: number;
  };
}

export async function fetchSendPreview(secret?: string): Promise<SendPreviewResponse> {
  const res = await fetch("/api/send/preview", {
    headers: authHeaders(secret),
  });
  const body = (await res.json().catch(() => ({}))) as SendPreviewResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Send preview failed (${res.status})`);
  }
  return body;
}
