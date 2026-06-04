import { getDb } from "./db.js";
import { upsertHb2844MobileTemplate } from "./texas-outreach-repository.js";

const TEXAS_LEAD_EXTRA_COLUMNS = [
  "website TEXT",
  "apollo_enriched_at TEXT",
  "contact_form_page_url TEXT",
  "outreach_sent_at TEXT",
  "resend_message_id TEXT",
] as const;

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

export async function runTexasMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS texas_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL,
        source TEXT NOT NULL,
        region TEXT NOT NULL DEFAULT 'TEXAS',
        business_name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        county TEXT,
        zip TEXT,
        phone TEXT,
        email TEXT,
        owner_name TEXT,
        inspection_score INTEGER,
        demerits INTEGER,
        vehicle_type TEXT,
        is_mobile_vendor INTEGER NOT NULL DEFAULT 0,
        vendor_tier TEXT,
        dshs_license_status TEXT NOT NULL DEFAULT 'PENDING_JULY_2026',
        risk_score INTEGER NOT NULL DEFAULT 0,
        intervention_level TEXT,
        last_inspection_date TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        draft_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(external_id, source)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_texas_leads_risk ON texas_leads(risk_score DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_texas_leads_mobile ON texas_leads(is_mobile_vendor)`,
      `CREATE INDEX IF NOT EXISTS idx_texas_leads_intervention ON texas_leads(intervention_level)`,
      `CREATE TABLE IF NOT EXISTS texas_outreach_templates (
        id TEXT PRIMARY KEY,
        region TEXT NOT NULL DEFAULT 'TEXAS',
        audience TEXT NOT NULL,
        subject TEXT,
        body_template TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    "write",
  );

  for (const column of TEXAS_LEAD_EXTRA_COLUMNS) {
    await addColumnIfMissing("texas_leads", column);
  }

  await upsertHb2844MobileTemplate();
}
