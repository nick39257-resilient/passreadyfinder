import { authHeaders } from "../lib/auth-headers.js";
import { getControlSecret } from "../lib/control-secret.js";

function controlAuthHeaders(secret?: string): Record<string, string> {
  return authHeaders(secret ?? getControlSecret());
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function startUkAutopilotJob(
  secret?: string,
): Promise<{ jobId: string }> {
  const res = await fetch("/api/uk/jobs/autopilot", {
    method: "POST",
    headers: controlAuthHeaders(secret),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    await parseError(res, "Failed to start UK autopilot");
  }
  return res.json() as Promise<{ jobId: string }>;
}

export async function startTexasAutopilotJob(
  secret?: string,
): Promise<{ jobId: string }> {
  const res = await fetch("/api/texas/jobs/autopilot", {
    method: "POST",
    headers: controlAuthHeaders(secret),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    await parseError(res, "Failed to start Texas autopilot");
  }
  return res.json() as Promise<{ jobId: string }>;
}

/** Starts UK + Texas autopilot jobs in parallel (mobile one-tap). */
export async function triggerAutopilotRuns(
  secret?: string,
): Promise<{ ukJobId: string; texasJobId: string }> {
  const [uk, texas] = await Promise.all([
    startUkAutopilotJob(secret),
    startTexasAutopilotJob(secret),
  ]);
  return { ukJobId: uk.jobId, texasJobId: texas.jobId };
}
