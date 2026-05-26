import { getDb } from "./db.js";

export type EngineLogSource = "find" | "draft" | "send" | "system";
export type EngineLogLevel = "info" | "error";

export interface EngineLogEntry {
  id: number;
  source: EngineLogSource;
  level: EngineLogLevel;
  message: string;
  detail: string | null;
  created_at: string;
}

export async function runEngineLogMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS engine_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_engine_logs_created_at ON engine_logs(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_engine_logs_level ON engine_logs(level)`,
    ],
    "write",
  );
}

export async function appendEngineLog(entry: {
  source: EngineLogSource;
  message: string;
  level?: EngineLogLevel;
  detail?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO engine_logs (source, level, message, detail)
      VALUES (?, ?, ?, ?)
    `,
    args: [entry.source, entry.level ?? "info", entry.message, entry.detail ?? null],
  });
}

export async function getRecentEngineLogs(limit = 5): Promise<EngineLogEntry[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, source, level, message, detail, created_at FROM engine_logs ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as EngineLogEntry[];
}

export async function getLatestEngineError(): Promise<EngineLogEntry | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, source, level, message, detail, created_at
      FROM engine_logs
      WHERE level = 'error'
      ORDER BY id DESC
      LIMIT 1
    `,
    args: [],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as EngineLogEntry;
}
