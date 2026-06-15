import { getDb } from "./db.js";
import { getRecentJobs, updateJob, type JobRecord, type JobType } from "./jobs-repository.js";

/** Max time without `updated_at` refresh before a live job is considered stuck. */
const STALE_WITHOUT_HEARTBEAT_MS: Partial<Record<JobType, number>> = {
  find: 20 * 60 * 1000,
  find_texas: 20 * 60 * 1000,
  market_find: 20 * 60 * 1000,
  texas_reclassify: 10 * 60 * 1000,
  texas_autopilot: 25 * 60 * 1000,
  uk_autopilot: 25 * 60 * 1000,
  draft: 15 * 60 * 1000,
  quick_draft: 15 * 60 * 1000,
  send: 15 * 60 * 1000,
  draft_all: 45 * 60 * 1000,
  contact_discovery: 15 * 60 * 1000,
};

const DEFAULT_STALE_MS = 15 * 60 * 1000;

function parseSqliteUtc(iso: string): number {
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

function staleThresholdMs(type: JobType): number {
  return STALE_WITHOUT_HEARTBEAT_MS[type] ?? DEFAULT_STALE_MS;
}

function isInFlight(status: string): boolean {
  return status === "pending" || status === "running";
}

/**
 * After a deploy/restart, in-flight jobs are orphaned — fail them so the UI pulse leaves Scraping.
 */
export async function reclaimOrphanedJobsOnStartup(): Promise<number> {
  const db = getDb();
  const before = await db.execute(
    `SELECT id FROM jobs WHERE status IN ('pending', 'running')`,
  );
  const count = before.rows.length;
  if (count === 0) {
    return 0;
  }

  await db.execute({
    sql: `
      UPDATE jobs SET
        status = 'failed',
        progress = 'Failed',
        error = 'Server restarted — job aborted (pulse reset to idle)',
        updated_at = datetime('now')
      WHERE status IN ('pending', 'running')
    `,
  });

  console.warn(`Reclaimed ${count} orphaned job(s) after server startup`);
  return count;
}

/** Fail jobs that exceeded heartbeat / runtime thresholds (survives crashed workers). */
export async function reclaimStaleJobs(): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    `SELECT * FROM jobs WHERE status IN ('pending', 'running') ORDER BY updated_at ASC`,
  );
  const rows = result.rows as unknown as JobRecord[];
  let reclaimed = 0;
  const now = Date.now();

  for (const job of rows) {
    const ageMs = now - parseSqliteUtc(job.updated_at);
    const pendingGraceMs = 3 * 60 * 1000;
    const limit =
      job.status === "pending"
        ? pendingGraceMs
        : staleThresholdMs(job.type);

    if (ageMs > limit) {
      await updateJob(job.id, {
        status: "failed",
        progress: "Failed",
        error:
          job.status === "pending"
            ? "Job stuck in queue — timed out"
            : `Job stalled (${Math.round(ageMs / 60_000)}m without progress) — pulse reset`,
      });
      reclaimed++;
    }
  }

  if (reclaimed > 0) {
    console.warn(`Reclaimed ${reclaimed} stale in-flight job(s)`);
  }
  return reclaimed;
}

/** Manual / status-poll recovery for stuck Scraping pulse. */
export async function reclaimAllInFlightJobs(reason: string): Promise<number> {
  const db = getDb();
  const before = await db.execute(
    `SELECT id FROM jobs WHERE status IN ('pending', 'running')`,
  );
  const count = before.rows.length;
  if (count === 0) {
    return 0;
  }

  await db.execute({
    sql: `
      UPDATE jobs SET
        status = 'failed',
        progress = 'Failed',
        error = ?,
        updated_at = datetime('now')
      WHERE status IN ('pending', 'running')
    `,
    args: [reason.slice(0, 500)],
  });

  return count;
}

export function findJobStillRunning(jobs: JobRecord[]): boolean {
  return jobs.some((j) => j.type === "find" && isInFlight(j.status));
}
