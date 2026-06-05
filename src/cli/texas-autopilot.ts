#!/usr/bin/env node
import "dotenv/config";
import { runTexasAutonomousOutreachBatch } from "../engine/texas/texas-autonomous-outreach.js";
import { closeDb } from "../engine/store/db.js";
import { runMigrations } from "../engine/store/db.js";
import { createJob, updateJob } from "../engine/store/jobs-repository.js";

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  console.log("Texas autonomous outreach — website discovery, email scrape, contact forms\n");

  await runMigrations();
  const jobId = await createJob("texas_autopilot", { limit: limit ?? null });
  await updateJob(jobId, { status: "running", progress: "Autopilot running…" });

  let summary: Awaited<ReturnType<typeof runTexasAutonomousOutreachBatch>> | null =
    null;
  try {
    summary = await runTexasAutonomousOutreachBatch({ limit });
    await updateJob(jobId, {
      status: "done",
      progress: "Complete",
      result: summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: "failed",
      progress: "Failed",
      error: message,
    });
    throw err;
  }

  console.log("\n---");
  console.log(`Scanned:          ${summary?.scanned ?? 0}`);
  console.log(`Emails found:     ${summary?.emailDiscovered ?? 0}`);
  console.log(`Forms submitted:  ${summary?.formSubmitted ?? 0}`);
  console.log(`CAPTCHA skipped:  ${summary?.captchaSkipped ?? 0}`);
  console.log(`No contact path:  ${summary?.noContact ?? 0}`);
  console.log(`Errors:           ${summary?.errors ?? 0}`);

  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
