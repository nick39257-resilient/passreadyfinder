import { getDb } from "./db.js";

export type ScoreTrafficSite = "uk" | "us";

export async function runScoreTrafficMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS score_traffic_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site TEXT NOT NULL CHECK(site IN ('uk', 'us')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_score_traffic_hits_site ON score_traffic_hits(site)`,
      `CREATE INDEX IF NOT EXISTS idx_score_traffic_hits_created ON score_traffic_hits(created_at DESC)`,
    ],
    "write",
  );
}

export async function recordScoreTrafficHit(site: ScoreTrafficSite): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO score_traffic_hits (site) VALUES (?)`,
    args: [site],
  });
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
