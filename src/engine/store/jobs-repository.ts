import { randomUUID } from "crypto";
import { getDb } from "./db.js";

export type JobType =
  | "find"
  | "draft"
  | "draft_all"
  | "send"
  | "quick_draft"
  | "contact_discovery";
export type JobStatus = "pending" | "running" | "done" | "failed";

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: string | null;
  result: string | null;
  error: string | null;
  params: string | null;
  created_at: string;
  updated_at: string;
}

const CONFIRM_TTL_MS = 5 * 60 * 1000;

async function jobsColumnExists(column: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(`PRAGMA table_info(jobs)`);
  return result.rows.some((row) => row.name === column);
}

export async function runJobsMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress TEXT,
        result TEXT,
        error TEXT,
        params TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS send_confirm_tokens (
        token TEXT PRIMARY KEY,
        approved_count INTEGER NOT NULL,
        expires_at TEXT NOT NULL
      )`,
    ],
    "write",
  );

  if (!(await jobsColumnExists("params"))) {
    await db.execute(`ALTER TABLE jobs ADD COLUMN params TEXT`);
  }
}

export async function createJob(type: JobType, params?: unknown): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  const paramsJson = params !== undefined ? JSON.stringify(params) : null;
  await db.execute({
    sql: `
      INSERT INTO jobs (id, type, status, progress, params)
      VALUES (?, ?, 'pending', 'Queued…', ?)
    `,
    args: [id, type, paramsJson],
  });
  return id;
}

export async function updateJob(
  id: string,
  patch: {
    status?: JobStatus;
    progress?: string;
    result?: unknown;
    error?: string;
  },
): Promise<void> {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const args: (string | number)[] = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    args.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push("progress = ?");
    args.push(patch.progress);
  }
  if (patch.result !== undefined) {
    sets.push("result = ?");
    args.push(JSON.stringify(patch.result));
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    args.push(patch.error);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM jobs WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as JobRecord;
}

export async function getRecentJobs(limit = 8): Promise<JobRecord[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM jobs ORDER BY updated_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as JobRecord[];
}

export async function getLatestJob(type?: JobType): Promise<JobRecord | null> {
  const db = getDb();
  const result = type
    ? await db.execute({
        sql: `SELECT * FROM jobs WHERE type = ? ORDER BY created_at DESC LIMIT 1`,
        args: [type],
      })
    : await db.execute(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1`);

  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as JobRecord;
}

export async function createSendConfirmToken(
  approvedCount: number,
): Promise<string> {
  const db = getDb();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS).toISOString();

  await db.execute(`DELETE FROM send_confirm_tokens WHERE expires_at < datetime('now')`);

  await db.execute({
    sql: `
      INSERT INTO send_confirm_tokens (token, approved_count, expires_at)
      VALUES (?, ?, ?)
    `,
    args: [token, approvedCount, expiresAt],
  });

  return token;
}

export async function consumeSendConfirmToken(
  token: string,
  expectedCount: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT approved_count, expires_at
      FROM send_confirm_tokens
      WHERE token = ?
    `,
    args: [token],
  });

  if (result.rows.length === 0) {
    return { ok: false, reason: "Invalid or expired confirm token" };
  }

  const row = result.rows[0];
  const approvedCount = Number(row.approved_count);
  const expiresAt = new Date(String(row.expires_at));

  if (expiresAt.getTime() < Date.now()) {
    await db.execute({
      sql: `DELETE FROM send_confirm_tokens WHERE token = ?`,
      args: [token],
    });
    return { ok: false, reason: "Confirm token expired — preview again" };
  }

  if (approvedCount !== expectedCount) {
    return {
      ok: false,
      reason: `Approved count changed (${approvedCount} → ${expectedCount}). Preview again.`,
    };
  }

  await db.execute({
    sql: `DELETE FROM send_confirm_tokens WHERE token = ?`,
    args: [token],
  });

  return { ok: true };
}
