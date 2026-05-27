#!/usr/bin/env node
import "dotenv/config";
import { tryEnrichLeadEmailFromWebsite } from "../engine/enrich/lead-email.js";
import { runMigrations, closeDb, getDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  await runMigrations();
  const db = getDb();
  const result = await db.execute(`
    SELECT id, business_name, website
    FROM leads
    WHERE (email IS NULL OR TRIM(email) = '')
      AND website IS NOT NULL
      AND TRIM(website) != ''
    ORDER BY lead_score DESC
    LIMIT 200
  `);

  let found = 0;
  for (const row of result.rows) {
    const id = Number(row.id);
    const website = String(row.website ?? "");
    const name = String(row.business_name ?? "");
    const email = await tryEnrichLeadEmailFromWebsite(id, website);
    if (email) {
      found++;
      console.log(`✓ ${name}: ${email}`);
    } else {
      console.log(`— ${name}: no email on website`);
    }
  }

  console.log("---");
  console.log(`Discovered ${found} email(s) from ${result.rows.length} website(s).`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
