import "dotenv/config";
import { runMigrations, getDb, closeDb } from "../src/engine/store/db.js";

const TARGETS = [
  "Khanz Lounge",
  "Good Hut Chinese Take Away",
  "Jade City Chinese Takeaway",
];

async function main(): Promise<void> {
  await runMigrations();
  const db = getDb();

  for (const name of TARGETS) {
    await db.execute({
      sql: `UPDATE leads SET phone = NULL, website = NULL, updated_at = datetime('now') WHERE business_name = ?`,
      args: [name],
    });
    await db.execute({
      sql: `DELETE FROM osm_cache WHERE fsa_id = (SELECT fsa_id FROM leads WHERE business_name = ? LIMIT 1)`,
      args: [name],
    });
    console.log(`Reset: ${name}`);
  }

  const check = await db.execute({
    sql: `SELECT business_name, phone, website FROM leads WHERE business_name IN (${TARGETS.map(() => "?").join(",")})`,
    args: TARGETS,
  });
  console.table(check.rows);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
