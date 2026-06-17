import { getDb } from "./db.js";

async function columnExists(table: string, column: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function addColumnIfMissing(table: string, columnDef: string): Promise<void> {
  const columnName = columnDef.split(" ")[0];
  if (!(await columnExists(table, columnName))) {
    const db = getDb();
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

const FLORIDA_LEAD_EXTRA_COLUMNS = [
  "website TEXT",
  "facebook_url TEXT",
  "instagram_url TEXT",
  "enrichment_status TEXT",
  "enrichment_detail TEXT",
  "enriched_at TEXT",
  "outreach_sent_at TEXT",
  "resend_message_id TEXT",
] as const;

export async function runFloridaMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS florida_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL,
        source TEXT NOT NULL,
        region TEXT NOT NULL DEFAULT 'FLORIDA',
        business_name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        county TEXT,
        zip TEXT,
        phone TEXT,
        email TEXT,
        license_number TEXT,
        license_type TEXT,
        risk_level TEXT,
        inspection_score INTEGER,
        priority_violations INTEGER,
        last_inspection_date TEXT,
        risk_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        draft_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(external_id, source)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_florida_leads_risk ON florida_leads(risk_score DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_florida_leads_county ON florida_leads(county)`,
      `CREATE INDEX IF NOT EXISTS idx_florida_leads_status ON florida_leads(status)`,
    ],
    "write",
  );

  for (const column of FLORIDA_LEAD_EXTRA_COLUMNS) {
    await addColumnIfMissing("florida_leads", column);
  }
}
