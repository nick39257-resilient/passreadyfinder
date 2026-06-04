#!/usr/bin/env node
import "dotenv/config";
import { runPhase1EnrichmentForLead } from "../engine/enrich/lead-enrichment-phase1.js";
import { runMigrations, closeDb, getDb } from "../engine/store/db.js";

async function main(): Promise<void> {
  const withForms = process.argv.includes("--forms");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;

  await runMigrations();
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, business_name
      FROM leads
      WHERE (email IS NULL OR TRIM(email) = '')
        AND status NOT IN ('suppressed', 'form_submitted')
        AND COALESCE(enrichment_status, 'PENDING') IN ('PENDING', 'FAILED', 'NO_EMAIL_FALLBACK')
      ORDER BY lead_score DESC
      LIMIT ?
    `,
    args: [limit],
  });

  console.log(
    `Phase 1 enrichment for ${result.rows.length} lead(s)${withForms ? " (contact forms enabled)" : ""}…\n`,
  );

  let emailFound = 0;
  let formSubmitted = 0;
  let failed = 0;

  for (const row of result.rows) {
    const id = Number(row.id);
    const name = String(row.business_name ?? "");
    const out = await runPhase1EnrichmentForLead(id, { allowContactForm: withForms });
    if (out.enrichmentStatus === "EMAIL_FOUND") {
      emailFound++;
      console.log(`✓ ${name}: ${out.email} (${out.detail})`);
    } else if (out.contactMethod === "CONTACT_FORM") {
      formSubmitted++;
      console.log(`⊕ ${name}: contact form (${out.detail})`);
    } else {
      failed++;
      console.log(`— ${name}: ${out.detail}`);
    }
  }

  console.log("---");
  console.log(`EMAIL_FOUND: ${emailFound}`);
  console.log(`FORM_SUBMITTED: ${formSubmitted}`);
  console.log(`Other/failed: ${failed}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
