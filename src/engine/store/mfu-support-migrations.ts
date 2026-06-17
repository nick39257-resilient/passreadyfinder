import { getDb } from "./db.js";

export async function runMfuSupportMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS mfu_support_facilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        facility_name TEXT NOT NULL,
        legal_term_used TEXT NOT NULL,
        governing_authority TEXT NOT NULL,
        license_number TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        primary_contact_name TEXT,
        street TEXT NOT NULL,
        city TEXT NOT NULL,
        county TEXT NOT NULL,
        zip_code TEXT NOT NULL,
        potable_water_fill INTEGER,
        greywater_dump INTEGER,
        grease_disposal INTEGER,
        commercial_kitchen_access INTEGER,
        dry_cold_storage INTEGER,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mfu_support_state ON mfu_support_facilities(state)`,
      `CREATE INDEX IF NOT EXISTS idx_mfu_support_city ON mfu_support_facilities(city)`,
      `CREATE INDEX IF NOT EXISTS idx_mfu_support_county ON mfu_support_facilities(county)`,
    ],
    "write",
  );
}
