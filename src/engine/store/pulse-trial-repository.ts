import { getDb } from "./db.js";

export interface TrialSignupEventInput {
  businessName: string;
  businessType?: string | null;
  market?: "uk" | "us";
  source?: string | null;
  email?: string | null;
}

export async function runPulseTrialMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS pulse_trial_signups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        business_type TEXT,
        market TEXT NOT NULL DEFAULT 'uk' CHECK(market IN ('uk', 'us')),
        source TEXT,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_pulse_trial_signups_created ON pulse_trial_signups(created_at DESC)`,
    ],
    "write",
  );
}

export async function recordPulseTrialSignup(input: TrialSignupEventInput): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      INSERT INTO pulse_trial_signups (business_name, business_type, market, source, email)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [
      input.businessName.trim().slice(0, 255),
      input.businessType?.trim().slice(0, 120) ?? null,
      input.market === "us" ? "us" : "uk",
      input.source?.trim().slice(0, 64) ?? null,
      input.email?.trim().slice(0, 320) ?? null,
    ],
  });
  return Number(result.lastInsertRowid ?? 0);
}

export type PulseTrialSignupRow = {
  id: number;
  businessName: string;
  businessType: string | null;
  market: "uk" | "us";
  source: string | null;
  createdAt: string;
};

function todayUtcDateSql(): string {
  return new Date().toISOString().slice(0, 10);
}

/** PassReady trial signups today (webhook table + UK leads marked trial_started today). */
export async function getTrialSignupsToday(limit = 20): Promise<PulseTrialSignupRow[]> {
  const db = getDb();
  const day = todayUtcDateSql();

  const webhookRows = await db.execute({
    sql: `
      SELECT id, business_name, business_type, market, source, created_at
      FROM pulse_trial_signups
      WHERE date(created_at) = date(?)
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [day, limit],
  });

  const leadRows = await db.execute({
    sql: `
      SELECT id, business_name, business_type, updated_at
      FROM leads
      WHERE status = 'trial_started'
        AND date(updated_at) = date(?)
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    args: [day, limit],
  });

  const merged: PulseTrialSignupRow[] = [];

  for (const row of webhookRows.rows) {
    merged.push({
      id: Number(row.id),
      businessName: String(row.business_name ?? "Workspace"),
      businessType: row.business_type ? String(row.business_type) : null,
      market: row.market === "us" ? "us" : "uk",
      source: row.source ? String(row.source) : "passready",
      createdAt: String(row.created_at ?? ""),
    });
  }

  for (const row of leadRows.rows) {
    merged.push({
      id: 1_000_000 + Number(row.id),
      businessName: String(row.business_name ?? "Lead"),
      businessType: row.business_type ? String(row.business_type) : null,
      market: "uk",
      source: "outreach",
      createdAt: String(row.updated_at ?? ""),
    });
  }

  merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return merged.slice(0, limit);
}
