/**
 * Proves suppressed + replied leads are excluded from draft and send pools,
 * and that suppression_list blocks by email on send.
 */
import { randomUUID } from "node:crypto";
import { fetchLeadsNeedingDraft } from "../src/engine/drafter.js";
import {
  isSecureUnsubscribeToken,
  isEmailSuppressed,
  OUTREACH_HALTED_STATUSES,
} from "../src/engine/outreach-halt.js";
import { getDb, runMigrations } from "../src/engine/store/db.js";
import {
  filterLeadsAllowedToSend,
  getApprovedLeads,
} from "../src/engine/store/sender-repository.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function countHaltedInDraftPool() {
  const pool = await fetchLeadsNeedingDraft(500);
  const db = getDb();
  const halted = await db.execute({
    sql: `SELECT id, status FROM leads WHERE status IN (${OUTREACH_HALTED_STATUSES.map(() => "?").join(",")})`,
    args: [...OUTREACH_HALTED_STATUSES],
  });
  const haltedIds = new Set(halted.rows.map((r) => Number(r.id)));
  const overlap = pool.filter((l) => haltedIds.has(l.id));
  return { poolSize: pool.length, overlap };
}

async function countHaltedInSendPool() {
  const pool = await getApprovedLeads(500);
  const db = getDb();
  const halted = await db.execute({
    sql: `SELECT id, status FROM leads WHERE status IN (${OUTREACH_HALTED_STATUSES.map(() => "?").join(",")})`,
    args: [...OUTREACH_HALTED_STATUSES],
  });
  const haltedIds = new Set(halted.rows.map((r) => Number(r.id)));
  const overlap = pool.filter((l) => haltedIds.has(l.id));
  return { poolSize: pool.length, overlap };
}

async function testEmailSuppressionOnSend() {
  const db = getDb();
  const testEmail = `suppression-test-${randomUUID().slice(0, 8)}@example.invalid`;
  await db.execute({
    sql: `INSERT INTO suppression_list (email, reason) VALUES (?, 'test')`,
    args: [testEmail],
  });

  const fakeLead = {
    id: -1,
    business_name: "Test",
    email: testEmail,
    draft_message: "hi",
    touch_count: 0,
    replied_at: null,
  };

  assert(await isEmailSuppressed(testEmail), "isEmailSuppressed should be true");
  const { allowed, skippedSuppressed } = await filterLeadsAllowedToSend([fakeLead]);
  assert(allowed.length === 0, "suppressed email must not be in allowed send list");
  assert(skippedSuppressed === 1, "suppressed email should increment skip count");

  await db.execute({
    sql: `DELETE FROM suppression_list WHERE email = ?`,
    args: [testEmail],
  });
}

async function main() {
  await runMigrations();

  assert(isSecureUnsubscribeToken(randomUUID()), "randomUUID must pass token check");
  assert(!isSecureUnsubscribeToken("104"), "lead id must not pass as token");
  assert(!isSecureUnsubscribeToken(`${randomUUID()}-104`), "token must not embed lead id only");

  const draft = await countHaltedInDraftPool();
  assert(
    draft.overlap.length === 0,
    `halted leads in draft pool: ${draft.overlap.map((l) => l.id).join(", ")}`,
  );

  const send = await countHaltedInSendPool();
  assert(
    send.overlap.length === 0,
    `halted leads in send pool: ${send.overlap.map((l) => l.id).join(", ")}`,
  );

  await testEmailSuppressionOnSend();

  console.log("OK outreach exclusions");
  console.log(
    JSON.stringify(
      {
        draftPoolSize: draft.poolSize,
        sendPoolSize: send.poolSize,
        haltedInDraft: draft.overlap.length,
        haltedInSend: send.overlap.length,
        tokenCheck: "uuid-v4",
        emailSuppression: "pass",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
