import { authHeaders } from "../lib/auth-headers.js";
import { getControlSecret } from "../lib/control-secret.js";

export type AutopilotKickoffResponse = {
  success: boolean;
  message: string;
  jobId: string;
  queueSize?: number;
  ingestStarted?: boolean;
  jobs?: Array<{ type: string; jobId: string }>;
};

function controlAuthHeaders(secret?: string): Record<string, string> {
  return authHeaders(secret ?? getControlSecret());
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `${fallback} (${res.status})`);
}

async function parseKickoff(
  res: Response,
  fallback: string,
): Promise<AutopilotKickoffResponse> {
  if (!res.ok) {
    await parseError(res, fallback);
  }
  return res.json() as Promise<AutopilotKickoffResponse>;
}

export async function startUkAutopilotJob(
  secret?: string,
): Promise<AutopilotKickoffResponse> {
  const res = await fetch("/api/uk/jobs/autopilot", {
    method: "POST",
    headers: controlAuthHeaders(secret),
    body: JSON.stringify({}),
  });
  return parseKickoff(res, "Failed to start UK autopilot");
}

export async function startTexasAutopilotJob(
  secret?: string,
): Promise<AutopilotKickoffResponse> {
  const res = await fetch("/api/texas/jobs/autopilot", {
    method: "POST",
    headers: controlAuthHeaders(secret),
    body: JSON.stringify({}),
  });
  return parseKickoff(res, "Failed to start Texas autopilot");
}

/** Starts UK + Texas autopilot jobs in parallel (mobile one-tap). */
export async function triggerAutopilotRuns(
  secret?: string,
): Promise<{ uk: AutopilotKickoffResponse; texas: AutopilotKickoffResponse }> {
  const [uk, texas] = await Promise.all([
    startUkAutopilotJob(secret),
    startTexasAutopilotJob(secret),
  ]);
  return { uk, texas };
}
