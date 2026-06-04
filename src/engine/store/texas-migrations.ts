import { getDb } from "./db.js";

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

  await db.execute({
    sql: `INSERT OR IGNORE INTO texas_outreach_templates (id, region, audience, subject, body_template)
          VALUES (?, 'TEXAS', 'mobile_vendor_hb2844', ?, ?)`,
    args: [
      "hb2844_mobile_july_2026",
      "HB 2844 — mobile unit compliance (July 2026)",
      "Hey [OwnerName], with the new state compliance rules kicking in this July under HB 2844, DSHS is centralizing all mobile truck inspections into a permanent statewide record. If you're still tracking logs on paper during transport, an inspector can halt your operations. We built PassReady to automate this exact digital chain of custody for [BusinessName]. Free score check: [ScoreUrl]",
    ],
  });
}
