import { getDb } from "./db.js";

export async function runGenericLeadsMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS generic_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_id TEXT NOT NULL,
        run_id TEXT,
        external_id TEXT NOT NULL,
        keyword TEXT,
        location_label TEXT NOT NULL,
        business_name TEXT NOT NULL,
        address TEXT,
        city TEXT,
        postcode TEXT,
        latitude REAL,
        longitude REAL,
        phone TEXT,
        website TEXT,
        email TEXT,
        gap_reasons TEXT,
        priority_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(market_id, external_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_generic_leads_market ON generic_leads(market_id)`,
      `CREATE INDEX IF NOT EXISTS idx_generic_leads_run ON generic_leads(run_id)`,
      `CREATE INDEX IF NOT EXISTS idx_generic_leads_priority ON generic_leads(priority_score DESC)`,
    ],
    "write",
  );
}
