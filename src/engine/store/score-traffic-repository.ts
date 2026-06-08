import { getDb } from "./db.js";

export type ScoreTrafficSite = "uk" | "us";

async function hitsColumnExists(column: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(`PRAGMA table_info(score_traffic_hits)`);
  return result.rows.some((row) => row.name === column);
}

export async function runScoreTrafficMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS score_traffic_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site TEXT NOT NULL CHECK(site IN ('uk', 'us')),
        rid TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_score_traffic_hits_site ON score_traffic_hits(site)`,
      `CREATE INDEX IF NOT EXISTS idx_score_traffic_hits_created ON score_traffic_hits(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_score_traffic_hits_rid ON score_traffic_hits(rid)`,
    ],
    "write",
  );

  if (!(await hitsColumnExists("rid"))) {
    await db.execute(`ALTER TABLE score_traffic_hits ADD COLUMN rid TEXT`);
  }
}

export async function recordScoreTrafficHit(
  site: ScoreTrafficSite,
  rid?: number | null,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO score_traffic_hits (site, rid) VALUES (?, ?)`,
    args: [site, rid != null && rid > 0 ? String(rid) : null],
  });
}

export function parseScoreTrafficRid(raw: unknown): number | null {
  const value = typeof raw === "string" ? raw.trim() : String(raw ?? "");
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  return n;
}

/** Attribute a pixel hit to a UK or Texas lead and flag for operator follow-up. */
export async function attributeScorePreviewToLead(input: {
  site: ScoreTrafficSite;
  rid: number;
}): Promise<{ attributed: boolean; table: "leads" | "texas_leads" | null }> {
  const db = getDb();

  if (input.site === "uk") {
    const result = await db.execute({
      sql: `
        UPDATE leads
        SET last_previewed_at = datetime('now'),
            flag_for_review = 1,
            needs_eyes_reason = COALESCE(NULLIF(TRIM(needs_eyes_reason), ''), 'LIVE_SCORE_PREVIEW'),
            needs_eyes_updated_at = datetime('now'),
            updated_at = datetime('now')
        WHERE fsa_id = ?
      `,
      args: [input.rid],
    });
    const attributed = (result.rowsAffected ?? 0) > 0;
    return { attributed, table: attributed ? "leads" : null };
  }

  const result = await db.execute({
    sql: `
      UPDATE texas_leads
      SET last_previewed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.rid],
  });
  const attributed = (result.rowsAffected ?? 0) > 0;
  return { attributed, table: attributed ? "texas_leads" : null };
}

export async function recordAttributedScoreTrafficHit(input: {
  site: ScoreTrafficSite;
  rid: number;
}): Promise<{ attributed: boolean }> {
  await recordScoreTrafficHit(input.site, input.rid);
  const { attributed } = await attributeScorePreviewToLead(input);
  return { attributed };
}

export async function getScoreTrafficCounts(): Promise<{
  uk: number;
  us: number;
  total: number;
}> {
  const db = getDb();
  const uk = await db.execute(
    `SELECT COUNT(*) AS c FROM score_traffic_hits WHERE site = 'uk'`,
  );
  const us = await db.execute(
    `SELECT COUNT(*) AS c FROM score_traffic_hits WHERE site = 'us'`,
  );
  const ukCount = Number(uk.rows[0]?.c ?? 0);
  const usCount = Number(us.rows[0]?.c ?? 0);
  return {
    uk: ukCount,
    us: usCount,
    total: ukCount + usCount,
  };
}
