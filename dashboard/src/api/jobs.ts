import { authHeaders } from "../lib/auth-headers.js";

export async function startFindJob(
  area: string,
  targetRating: number,
  secret?: string,
): Promise<string> {
  const res = await fetch("/api/jobs/find", {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify({ area, targetRating }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Find job failed (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string };
  return data.jobId;
}

export async function startDraftJob(targetRating?: number, secret?: string): Promise<string> {
  const res = await fetch("/api/jobs/draft", {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify(targetRating ? { targetRating } : {}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Draft job failed (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string };
  return data.jobId;
}

export async function startSendJob(
  confirmToken: string,
  expectedCount: number,
  secret?: string,
): Promise<string> {
  const res = await fetch("/api/jobs/send", {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify({ confirmToken, expectedCount }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Send job failed (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string };
  return data.jobId;
}
