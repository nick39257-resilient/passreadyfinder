import { getDb } from "./db.js";

export type MarketingTrafficSource = "flyer" | "nfc" | "web" | "direct";

export interface MarketingTrafficHitInput {
  source: MarketingTrafficSource;
  site?: "uk" | "us";
  postcodeOutward?: string | null;
  path?: string | null;
}

async function columnExists(column: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(`PRAGMA table_info(marketing_traffic_hits)`);
  return result.rows.some((row) => row.name === column);
}

export async function runMarketingTrafficMigrations(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS marketing_traffic_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL CHECK(source IN ('flyer', 'nfc', 'web', 'direct')),
        site TEXT NOT NULL DEFAULT 'uk' CHECK(site IN ('uk', 'us')),
        postcode_outward TEXT,
        path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_marketing_traffic_created ON marketing_traffic_hits(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_marketing_traffic_source ON marketing_traffic_hits(source, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_marketing_traffic_postcode ON marketing_traffic_hits(postcode_outward)`,
    ],
    "write",
  );

  if (!(await columnExists("path"))) {
    await db.execute(`ALTER TABLE marketing_traffic_hits ADD COLUMN path TEXT`);
  }
}

export function parseMarketingSource(raw: unknown): MarketingTrafficSource | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "flyer" || value === "nfc" || value === "web" || value === "direct") {
    return value;
  }
  return null;
}

/** UK outward area letters before the digit block — PR from PR1, M from M1, EC from EC1A. */
export function ukPostcodeAreaPrefix(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^([A-Z]{1,2})/);
  return match?.[1] ?? null;
}

export function parsePostcodeOutward(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (trimmed.length < 2 || trimmed.length > 8) {
    return null;
  }
  return ukPostcodeAreaPrefix(trimmed) ?? trimmed.slice(0, 2);
}

export async function recordMarketingTrafficHit(input: MarketingTrafficHitInput): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO marketing_traffic_hits (source, site, postcode_outward, path)
      VALUES (?, ?, ?, ?)
    `,
    args: [
      input.source,
      input.site ?? "uk",
      input.postcodeOutward ?? null,
      input.path?.trim().slice(0, 512) ?? null,
    ],
  });
}

function todayUtcDateSql(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getMarketingTrafficTodayCounts(): Promise<{
  total: number;
  flyer: number;
  nfc: number;
  web: number;
}> {
  const db = getDb();
  const day = todayUtcDateSql();
  const result = await db.execute({
    sql: `
      SELECT source, COUNT(*) AS c
      FROM marketing_traffic_hits
      WHERE date(created_at) = date(?)
      GROUP BY source
    `,
    args: [day],
  });

  let flyer = 0;
  let nfc = 0;
  let web = 0;
  let direct = 0;
  for (const row of result.rows) {
    const source = String(row.source ?? "");
    const count = Number(row.c ?? 0);
    if (source === "flyer") flyer = count;
    else if (source === "nfc") nfc = count;
    else if (source === "web") web = count;
    else if (source === "direct") direct = count;
  }

  return {
    total: flyer + nfc + web + direct,
    flyer,
    nfc,
    web,
  };
}

export type RegionalTrafficRow = {
  postcodePrefix: string;
  hits: number;
  flyerHits: number;
  nfcHits: number;
};

/** Physical marketing hits (flyer + NFC) grouped by UK postcode prefix, today only. */
export async function getRegionalMarketingTrafficToday(limit = 12): Promise<RegionalTrafficRow[]> {
  const db = getDb();
  const day = todayUtcDateSql();
  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(postcode_outward, '??') AS prefix,
        COUNT(*) AS hits,
        SUM(CASE WHEN source = 'flyer' THEN 1 ELSE 0 END) AS flyer_hits,
        SUM(CASE WHEN source = 'nfc' THEN 1 ELSE 0 END) AS nfc_hits
      FROM marketing_traffic_hits
      WHERE date(created_at) = date(?)
        AND source IN ('flyer', 'nfc')
        AND postcode_outward IS NOT NULL
        AND TRIM(postcode_outward) != ''
      GROUP BY prefix
      ORDER BY hits DESC, prefix ASC
      LIMIT ?
    `,
    args: [day, limit],
  });

  return result.rows.map((row) => ({
    postcodePrefix: String(row.prefix ?? "??"),
    hits: Number(row.hits ?? 0),
    flyerHits: Number(row.flyer_hits ?? 0),
    nfcHits: Number(row.nfc_hits ?? 0),
  }));
}
