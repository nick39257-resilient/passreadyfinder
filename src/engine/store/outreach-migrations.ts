import { getDb } from "./db.js";

const LEAD_PHASE_B_COLUMNS = [
  "status TEXT NOT NULL DEFAULT 'new'",
  "contacted_at TEXT",
  "opted_in_at TEXT",
  "unsubscribe_token TEXT",
  "email TEXT",
  "draft_message TEXT",
  "touch_count INTEGER NOT NULL DEFAULT 0",
] as const;

async function columnExists(table: string, column: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function addColumnIfMissing(
  table: string,
  columnDef: string,
): Promise<void> {
  const columnName = columnDef.split(" ")[0];
  if (!(await columnExists(table, columnName))) {
    const db = getDb();
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

export async function runOutreachMigrations(): Promise<void> {
  const db = getDb();

  for (const column of LEAD_PHASE_B_COLUMNS) {
    await addColumnIfMissing("leads", column);
  }

  await db.batch(
    [
      `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_unsubscribe_token ON leads(unsubscribe_token)`,
      `CREATE TABLE IF NOT EXISTS email_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewed_at TEXT,
        sent_at TEXT,
        resend_id TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_email_drafts_status ON email_drafts(status)`,
      `CREATE INDEX IF NOT EXISTS idx_email_drafts_lead_id ON email_drafts(lead_id)`,
      `CREATE TABLE IF NOT EXISTS suppression_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        lead_id INTEGER,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS email_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        draft_id INTEGER,
        event_type TEXT NOT NULL,
        resend_id TEXT,
        detail TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type)`,
      `CREATE TABLE IF NOT EXISTS outreach_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
    "write",
  );

  await db.execute({
    sql: `INSERT OR IGNORE INTO outreach_settings (key, value) VALUES ('sending_paused', 'false')`,
    args: [],
  });

  // Backfill: leads with AI drafts should appear in the review queue
  await db.execute(`
    UPDATE leads SET status = 'drafted'
    WHERE draft_message IS NOT NULL AND status = 'new'
  `);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT value FROM outreach_settings WHERE key = ?`,
    args: [key],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].value as string;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO outreach_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}

export async function isSendingPaused(): Promise<boolean> {
  return (await getSetting("sending_paused")) === "true";
}

export async function setSendingPaused(paused: boolean): Promise<void> {
  await setSetting("sending_paused", paused ? "true" : "false");
}
