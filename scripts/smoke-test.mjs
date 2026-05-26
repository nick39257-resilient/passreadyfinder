#!/usr/bin/env node
/**
 * Local smoke test — run: node scripts/smoke-test.mjs
 * Does not call Gemini or FSA (DB + env + optional server only).
 */
import "dotenv/config";

const checks = [];

function pass(name, detail = "") {
  checks.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  checks.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
if (!url || url.includes("your-database-name")) {
  fail("TURSO_DATABASE_URL", "still placeholder — set real libsql:// URL from turso.tech");
} else if (!url.startsWith("libsql://")) {
  fail("TURSO_DATABASE_URL", "must start with libsql://");
} else {
  pass("TURSO_DATABASE_URL", "set");
}

if (!process.env.TURSO_AUTH_TOKEN?.trim()) {
  fail("TURSO_AUTH_TOKEN", "missing");
} else {
  pass("TURSO_AUTH_TOKEN", "set");
}

for (const key of ["OPENAI_API_KEY", "OPENAI_BASE_URL", "WHATSAPP_NUMBER"]) {
  if (!process.env[key]?.trim()) {
    fail(key, "missing");
  } else {
    pass(key, "set");
  }
}

if (url && !url.includes("your-database-name")) {
  try {
    const { runMigrations, getDb, closeDb } = await import("../src/engine/store/db.js");
    await runMigrations();
    const r = await getDb().execute("SELECT COUNT(*) AS c FROM leads");
    pass("Database", `${r.rows[0]?.c ?? 0} leads`);
    const { getSystemStatus } = await import("../src/engine/intelligence/system-status.js");
    const status = await getSystemStatus(5);
    pass("System status", `pulse=${status.pulse}, feed=${status.feed.length} logs`);
    await closeDb();
  } catch (err) {
    fail("Database", err instanceof Error ? err.message : String(err));
  }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
