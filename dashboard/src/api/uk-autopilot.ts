import { authHeaders } from "../lib/auth-headers.js";
import { getControlSecret } from "../lib/control-secret.js";
import type { AutopilotStatusResponse } from "../lib/autopilot-heartbeat.js";

function ukAuthHeaders(secret?: string): Record<string, string> {
  return authHeaders(secret ?? getControlSecret());
}

async function parseUkError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchUkAutopilotStatus(
  secret?: string,
): Promise<AutopilotStatusResponse> {
  const res = await fetch("/api/uk/status", {
    headers: ukAuthHeaders(secret),
  });
  if (!res.ok) {
    await parseUkError(res, "UK autopilot status failed");
  }
  return res.json() as Promise<AutopilotStatusResponse>;
}
