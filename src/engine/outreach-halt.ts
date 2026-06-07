import { randomUUID } from "node:crypto";
import {
  cleanOutreachEmail,
  explainOutreachEmailIssue,
  formatOutreachEmailIssue,
  isValidOutreachEmail,
  normalizeOutreachEmail,
} from "./outreach-email.js";
import { getDb } from "./store/db.js";
import { runMigrations } from "./store/db.js";
import type { LeadRow } from "./store/leads-repository.js";

export {
  cleanOutreachEmail,
  explainOutreachEmailIssue,
  formatOutreachEmailIssue,
  isValidOutreachEmail,
  normalizeOutreachEmail,
};

/** Statuses that must never receive another draft or send. */
export const OUTREACH_HALTED_STATUSES = [
  "suppressed",
  "replied",
  "opted_in",
  "trial_started",
  "nurture",
  "form_submitted",
] as const;

export type OutreachHaltedStatus = (typeof OUTREACH_HALTED_STATUSES)[number];

export function isOutreachHaltedStatus(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }
  return (OUTREACH_HALTED_STATUSES as readonly string[]).includes(status);
}

export function isLeadOutreachHalted(row: {
  status?: string | null;
}): boolean {
  return isOutreachHaltedStatus(row.status ?? null);
}

export function outreachHaltedSqlInClause(): string {
  const placeholders = OUTREACH_HALTED_STATUSES.map(() => "?").join(", ");
  return `status NOT IN (${placeholders})`;
}

export function outreachHaltedSqlArgs(): string[] {
  return [...OUTREACH_HALTED_STATUSES];
}

/** RFC 4122 UUID — never derived from lead id. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSecureUnsubscribeToken(token: string | null | undefined): boolean {
  return Boolean(token?.trim() && UUID_V4_RE.test(token.trim()));
}

/** SQL fragment: lead email not on suppression_list (pass no extra args). */
export function emailNotSuppressedSql(alias = "leads"): string {
  return `(
    ${alias}.email IS NULL
    OR TRIM(${alias}.email) = ''
    OR LOWER(TRIM(${alias}.email)) NOT IN (SELECT email FROM suppression_list)
  )`;
}

export async function isEmailSuppressed(email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeOutreachEmail(email);
  if (!normalized) {
    return false;
  }
  await runMigrations();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT 1 FROM suppression_list WHERE email = ? LIMIT 1`,
    args: [normalized],
  });
  return result.rows.length > 0;
}

export async function ensureLeadUnsubscribeToken(leadId: number): Promise<string> {
  await runMigrations();
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT unsubscribe_token FROM leads WHERE id = ?`,
    args: [leadId],
  });
  const token = existing.rows[0]?.unsubscribe_token as string | undefined;
  if (isSecureUnsubscribeToken(token)) {
    return token!.trim();
  }

  const newToken = randomUUID();
  await db.execute({
    sql: `UPDATE leads SET unsubscribe_token = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [newToken, leadId],
  });
  return newToken;
}

export async function getLeadByUnsubscribeToken(token: string): Promise<LeadRow | null> {
  await runMigrations();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM leads WHERE unsubscribe_token = ?`,
    args: [token.trim()],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as LeadRow;
}

async function addEmailToSuppressionList(
  email: string | null | undefined,
  leadId: number,
  reason: string,
): Promise<void> {
  const normalized = normalizeOutreachEmail(email);
  if (!normalized) {
    return;
  }
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO suppression_list (email, lead_id, reason)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET lead_id = excluded.lead_id, reason = excluded.reason
    `,
    args: [normalized, leadId, reason],
  });
}

export async function suppressLead(leadId: number, reason = "unsubscribe"): Promise<void> {
  await runMigrations();
  const db = getDb();
  const row = await db.execute({
    sql: `SELECT id, email FROM leads WHERE id = ?`,
    args: [leadId],
  });
  if (row.rows.length === 0) {
    throw new Error("Lead not found");
  }
  const email = row.rows[0].email as string | null;

  await db.execute({
    sql: `
      UPDATE leads
      SET status = 'suppressed', updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [leadId],
  });
  await addEmailToSuppressionList(email, leadId, reason);
}

export async function suppressLeadByToken(token: string): Promise<boolean> {
  const lead = await getLeadByUnsubscribeToken(token);
  if (!lead) {
    return false;
  }
  await suppressLead(lead.id, "unsubscribe_link");
  return true;
}

/** Manual reply stop — no automatic inbox detection in this codebase. */
export async function stopSequenceForReply(leadId: number): Promise<void> {
  await runMigrations();
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET
        replied_at = COALESCE(replied_at, datetime('now')),
        status = 'replied',
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [leadId],
  });
  if ((result.rowsAffected ?? 0) === 0) {
    throw new Error("Lead not found");
  }
}

export type ConvertStage = "opted_in" | "trial_started";

export async function markLeadConverted(leadId: number, stage: ConvertStage): Promise<void> {
  await runMigrations();
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET
        status = ?,
        opted_in_at = CASE WHEN ? = 'opted_in' THEN datetime('now') ELSE opted_in_at END,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [stage, stage, leadId],
  });
  if ((result.rowsAffected ?? 0) === 0) {
    throw new Error("Lead not found");
  }
}

export function getPublicAppUrl(): string {
  const fromEnv =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const port = process.env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}

export function buildUnsubscribeUrl(token: string): string {
  return `${getPublicAppUrl()}/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`;
}

export const OPT_OUT_FOOTER_PREFIX =
  "\n\n—\nTo stop emails from PassReady about hygiene support, unsubscribe here:";

export function appendOptOutFooter(body: string, unsubscribeUrl: string): string {
  const trimmed = body.trim();
  if (trimmed.toLowerCase().includes("unsubscribe")) {
    return trimmed;
  }
  return `${trimmed}${OPT_OUT_FOOTER_PREFIX} ${unsubscribeUrl}`;
}
