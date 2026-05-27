import type { JobRecord, JobType } from "../store/jobs-repository.js";
import type { EngineLogEntry } from "../store/engine-log-repository.js";

/** Failed jobs / engine errors older than this do not surface on the Command Center badge. */
export const PULSE_ERROR_MAX_AGE_MS = 60 * 60 * 1000;

function parseSqliteUtcTimestamp(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return NaN;
  }
  if (trimmed.includes("T")) {
    return new Date(trimmed.endsWith("Z") ? trimmed : `${trimmed}Z`).getTime();
  }
  return new Date(`${trimmed.replace(" ", "T")}Z`).getTime();
}

export function isWithinPulseErrorWindow(timestamp: string, nowMs = Date.now()): boolean {
  const at = parseSqliteUtcTimestamp(timestamp);
  if (Number.isNaN(at)) {
    return false;
  }
  return nowMs - at < PULSE_ERROR_MAX_AGE_MS;
}

export function isGeminiRateLimitError(error: string | null | undefined): boolean {
  if (!error?.trim()) {
    return false;
  }
  return /429|rate limit|resource exhausted|too many requests|gemini rate limited/i.test(error);
}

/** Human-readable failed-job copy — never label a draft/Gemini failure as "Send failed". */
export function formatFailedJobError(type: JobType | string, error: string | null): string {
  switch (type) {
    case "find": {
      return error?.trim() ? `FindLeads failed: ${error}` : "FindLeads job failed";
    }
    case "draft":
    case "quick_draft": {
      if (isGeminiRateLimitError(error)) {
        return "Drafting paused: Gemini busy — will retry";
      }
      return error?.trim() ? `Drafting failed: ${error}` : "Drafting job failed";
    }
    case "send": {
      return error?.trim() ? `Send failed: ${error}` : "Send job failed";
    }
    default: {
      return error?.trim() ? `Job failed: ${error}` : "Job failed";
    }
  }
}

function formatEngineLogError(entry: EngineLogEntry): string {
  if (entry.detail?.trim()) {
    return `${entry.message} — ${entry.detail}`;
  }
  return entry.message;
}

/**
 * Resolve job-table error for pulse. Uses recent jobs by updated_at (newest first).
 * Returns null if the latest terminal state is success, failure is stale (>60m),
 * or a newer successful job exists.
 */
export function resolveRecentJobPulseError(
  recentJobs: JobRecord[],
  nowMs = Date.now(),
): string | null {
  if (recentJobs.length === 0) {
    return null;
  }

  const newest = recentJobs[0];
  if (newest.status === "done" || newest.status === "running" || newest.status === "pending") {
    return null;
  }

  if (newest.status !== "failed") {
    return null;
  }

  if (!isWithinPulseErrorWindow(newest.updated_at, nowMs)) {
    return null;
  }

  const failedAt = parseSqliteUtcTimestamp(newest.updated_at);
  const newerSuccess = recentJobs.some((job) => {
    if (job.status !== "done") {
      return false;
    }
    const doneAt = parseSqliteUtcTimestamp(job.updated_at);
    return !Number.isNaN(doneAt) && doneAt > failedAt;
  });

  if (newerSuccess) {
    return null;
  }

  return formatFailedJobError(newest.type, newest.error);
}

export function resolveEngineLogPulseError(
  latestError: EngineLogEntry | null,
  nowMs = Date.now(),
): string | null {
  if (!latestError) {
    return null;
  }
  if (!isWithinPulseErrorWindow(latestError.created_at, nowMs)) {
    return null;
  }
  return formatEngineLogError(latestError);
}
