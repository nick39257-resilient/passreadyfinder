import { createClient, type Client } from "@libsql/client";
import "dotenv/config";

let client: Client | null = null;

export function getDb(): Client {
  if (client) {
    return client;
  }

  const useRemoteOnly = process.env.VERCEL || process.env.RENDER;
  const localPath = useRemoteOnly ? undefined : process.env.TURSO_LOCAL_PATH;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (localPath) {
    client = createClient({ url: `file:${localPath}` });
  } else if (url) {
    client = createClient({
      url,
      authToken: authToken ?? undefined,
    });
  } else {
    throw new Error(
      "Database not configured. Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, or TURSO_LOCAL_PATH for local dev.",
    );
  }

  return client;
}

let migrationsPromise: Promise<void> | null = null;

async function runMigrationsOnce(): Promise<void> {
  const db = getDb();

  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fsa_id INTEGER NOT NULL UNIQUE,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        address TEXT NOT NULL,
        postcode TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        fsa_rating INTEGER,
        fsa_last_inspection_date TEXT,
        phone TEXT,
        website TEXT,
        on_delivery_app TEXT NOT NULL DEFAULT 'unknown',
        lead_score INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_leads_fsa_id ON leads(fsa_id)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON leads(lead_score DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_name_postcode ON leads(business_name, postcode)`,
      `CREATE TABLE IF NOT EXISTS osm_cache (
        fsa_id INTEGER PRIMARY KEY,
        phone TEXT,
        website TEXT,
        on_delivery_app TEXT NOT NULL DEFAULT 'unknown',
        queried_at TEXT NOT NULL DEFAULT (datetime('now')),
        raw_response TEXT
      )`,
    ],
    "write",
  );

  const { runOutreachMigrations } = await import("./outreach-migrations.js");
  await runOutreachMigrations();

  const { runJobsMigrations } = await import("./jobs-repository.js");
  await runJobsMigrations();

  const { runEngineLogMigrations } = await import("./engine-log-repository.js");
  await runEngineLogMigrations();

  const { runContactDiscoveryMigrations } = await import("./contact-discovery-repository.js");
  await runContactDiscoveryMigrations();

  const { runTexasMigrations } = await import("./texas-migrations.js");
  await runTexasMigrations();

  const { runScoreTrafficMigrations } = await import("./score-traffic-repository.js");
  await runScoreTrafficMigrations();

  const { runGenericLeadsMigrations } = await import("./generic-leads-migrations.js");
  await runGenericLeadsMigrations();

  const { runFloridaMigrations } = await import("./florida-migrations.js");
  await runFloridaMigrations();
}

export async function runMigrations(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = runMigrationsOnce().catch((err) => {
      migrationsPromise = null;
      throw err;
    });
  }
  await migrationsPromise;
}

export async function closeDb(): Promise<void> {
  if (client) {
    client.close();
    client = null;
  }
}
