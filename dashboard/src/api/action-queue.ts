import { authHeaders } from "../lib/auth-headers.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export interface ActionQueueItem {
  leadId: number;
  businessName: string;
  postcode: string;
  fsaRating: number | null;
  riskScore: number;
  leadScore: number;
  lane: "warm" | "trigger" | "whatsapp" | "call";
  priorityScore: number;
  reasons: string[];
  phone: string | null;
  whatsappUrl: string | null;
  whatsappMessage: string | null;
  email: string | null;
  lastPreviewedAt: string | null;
  recentlyChanged: boolean;
  status: string;
  whatsappSentAt: string | null;
  callLoggedAt: string | null;
}

export interface CopilotMetrics {
  scoreClicksTotal: number;
  scoreClicksUk: number;
  scoreClicksUs: number;
  whatsappSentToday: number;
  whatsappSentTotal: number;
  callsLoggedToday: number;
  callsLoggedTotal: number;
  repliesTotal: number;
  warmVisitors7d: number;
  whatsappDailyCap: number;
  copilotMode: boolean;
}

export interface ActionQueueDigest {
  generatedAt: string;
  digestSize: number;
  top: ActionQueueItem[];
  warm: ActionQueueItem[];
  triggers: ActionQueueItem[];
  whatsappQueue: ActionQueueItem[];
  callQueue: ActionQueueItem[];
  metrics: CopilotMetrics;
}

export async function fetchActionQueueDigest(): Promise<ActionQueueDigest> {
  const res = await fetchWithTimeout("/api/action-queue/digest");
  if (!res.ok) {
    throw new Error("Failed to load action queue");
  }
  return res.json() as Promise<ActionQueueDigest>;
}

export async function markWhatsAppSentApi(
  leadId: number,
  secret?: string,
): Promise<void> {
  const res = await fetchWithTimeout(`/api/leads/${leadId}/mark-whatsapp-sent`, {
    method: "POST",
    headers: authHeaders(secret),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to mark WhatsApp sent");
  }
}

export async function markCallLoggedApi(
  leadId: number,
  secret?: string,
): Promise<void> {
  const res = await fetchWithTimeout(`/api/leads/${leadId}/mark-call-logged`, {
    method: "POST",
    headers: authHeaders(secret),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to mark call logged");
  }
}
