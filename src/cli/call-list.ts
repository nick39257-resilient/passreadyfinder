#!/usr/bin/env node
/**
 * Printable call sheet — npm run call-list
 */
import "dotenv/config";
import { callListSortKey, isCallListLead } from "../engine/call-list.js";
import { closeDb, getDb, runMigrations } from "../engine/store/db.js";

async function main(): Promise<void> {
  await runMigrations();
  const db = getDb();
  const result = await db.execute(`
    SELECT id, business_name, phone, postcode, fsa_rating, status, lead_score, email, replied_at
    FROM leads
    ORDER BY lead_score DESC
  `);

  const rows = (result.rows as Record<string, unknown>[]).filter((row) =>
    isCallListLead({
      status: String(row.status ?? "new"),
      phone: row.phone as string | null,
      repliedAt: row.replied_at as string | null,
    }),
  );

  rows.sort((a, b) => callListSortKey(b as never) - callListSortKey(a as never));

  console.log("\n=== PassFinder call list (phone, no reply yet) ===\n");
  if (rows.length === 0) {
    console.log("No callable leads — run find + enrich, or check Sent/Replies tabs.");
    return;
  }

  for (const row of rows.slice(0, 40)) {
    const name = String(row.business_name ?? "");
    const phone = String(row.phone ?? "").trim();
    const pc = String(row.postcode ?? "");
    const rating = row.fsa_rating != null ? `${row.fsa_rating}★` : "—";
    const status = String(row.status ?? "");
    const email = String(row.email ?? "").trim();
    console.log(`${phone.padEnd(16)} ${rating.padEnd(4)} ${status.padEnd(10)} ${pc.padEnd(8)} ${name}`);
    if (email) {
      console.log(`${"".padEnd(16)} email: ${email}`);
    }
  }

  console.log(`\n${rows.length} callable lead(s) — showing up to 40. Use dashboard Call tab on phone.\n`);
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
