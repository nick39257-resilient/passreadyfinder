import { getComplianceTipOfDay } from "./compliance.js";
import {
  getLatestEngineError,
  getRecentEngineLogs,
  type EngineLogEntry,
} from "../store/engine-log-repository.js";
import { getLatestJob, getRecentJobs } from "../store/jobs-repository.js";
import { getLeadStatusCounts } from "../store/stats-repository.js";
import { runMigrations } from "../store/db.js";

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

export interface SystemStatus {
  pulse: SystemPulseState;
  pulseLabel: string;
  errorMessage: string | null;
  feed: SystemStatusFeedItem[];
  needsReviewCount: number;
  complianceTip: string;
}

const PULSE_LABELS: Record<SystemPulseState, string> = {
  idle: "Idle",
  scraping: "Scraping",
  drafting: "Drafting",
  needs_review: "Needs Review",
  error: "Error",
};

function mapFeedEntry(row: EngineLogEntry): SystemStatusFeedItem {
  return {
    id: row.id,
    message: row.message,
    level: row.level,
    source: row.source,
    createdAt: row.created_at,
  };
}

function formatFailedJobError(type: string, error: string | null): string {
  const label = type === "find" ? "FindLeads" : type === "draft" ? "QueueDrafter" : "Send";
  return error?.trim() ? `${label} failed: ${error}` : `${label} job failed`;
}

export async function getSystemStatus(feedLimit = 5): Promise<SystemStatus> {
  await runMigrations();

  const [logs, latestError, statusCounts, recentJobs, latestJob] = await Promise.all([
    getRecentEngineLogs(feedLimit),
    getLatestEngineError(),
    getLeadStatusCounts(),
    getRecentJobs(12),
    getLatestJob(),
  ]);

  const needsReviewCount = statusCounts.drafted;
  const feed = logs.map(mapFeedEntry);

  const runningFind = recentJobs.some((j) => j.type === "find" && j.status === "running");
  const runningDraft = recentJobs.some((j) => j.type === "draft" && j.status === "running");

  let pulse: SystemPulseState = "idle";
  let errorMessage: string | null = null;

  if (runningFind) {
    pulse = "scraping";
  } else if (runningDraft) {
    pulse = "drafting";
  } else if (latestJob?.status === "failed") {
    pulse = "error";
    errorMessage = formatFailedJobError(latestJob.type, latestJob.error);
  } else if (latestError) {
    const errorAge = Date.now() - new Date(latestError.created_at).getTime();
    const recentErrorMs = 24 * 60 * 60 * 1000;
    if (errorAge < recentErrorMs) {
      pulse = "error";
      errorMessage = latestError.detail?.trim()
        ? `${latestError.message} — ${latestError.detail}`
        : latestError.message;
    }
  } else if (needsReviewCount > 0) {
    pulse = "needs_review";
  }

  return {
    pulse,
    pulseLabel: PULSE_LABELS[pulse],
    errorMessage,
    feed,
    needsReviewCount,
    complianceTip: getComplianceTipOfDay(),
  };
}

export async function logFindLeadsResult(result: {
  stored: number;
  fetched: number;
}): Promise<void> {
  const { appendEngineLog } = await import("../store/engine-log-repository.js");
  await appendEngineLog({
    source: "find",
    message:
      result.stored > 0
        ? `Scraped ${result.stored} lead${result.stored === 1 ? "" : "s"}`
        : `FindLeads complete — ${result.fetched} FSA match${result.fetched === 1 ? "" : "es"}`,
    level: "info",
  });
}

export async function logQueueDrafterResult(result: {
  drafted: number;
  errors: { error: string }[];
}): Promise<void> {
  const { appendEngineLog } = await import("../store/engine-log-repository.js");
  if (result.drafted > 0) {
    await appendEngineLog({
      source: "draft",
      message: `Drafted ${result.drafted} message${result.drafted === 1 ? "" : "s"}`,
      level: "info",
    });
  }
  if (result.errors.length > 0) {
    await appendEngineLog({
      source: "draft",
      message: `QueueDrafter: ${result.errors.length} lead(s) failed`,
      level: "error",
      detail: result.errors[0]?.error ?? null,
    });
  }
}

export async function logEngineError(
  source: "find" | "draft" | "send" | "system",
  message: string,
  detail?: string,
): Promise<void> {
  const { appendEngineLog } = await import("../store/engine-log-repository.js");
  await appendEngineLog({ source, message, level: "error", detail });
}
