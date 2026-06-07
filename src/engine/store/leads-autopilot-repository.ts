import type { LeadRow } from "./leads-repository.js";
import { getDb } from "./db.js";
import { LEAD_STATUS_READY_TO_REVIEW } from "../../types/enrichment.js";

/** Leads eligible for UK autopilot — no email, not yet contacted via form. */
export const UK_AUTOPILOT_QUEUE_SQL = `
  (email IS NULL OR TRIM(email) = '')
  AND status NOT IN ('suppressed', 'form_submitted', 'contacted', 'replied')
`;

export async function getUkLeadsForAutopilot(limit: number): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT * FROM leads
      WHERE ${UK_AUTOPILOT_QUEUE_SQL}
      ORDER BY lead_score DESC, fsa_rating ASC, id ASC
      LIMIT ?
    `,
    args: [limit],
  });
  return result.rows as unknown as LeadRow[];
}

export async function updateUkLeadWebsite(input: {
  leadId: number;
  website: string;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        website = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.website.trim(), input.leadId],
  });
}

export async function markUkLeadEmailDiscovered(input: {
  leadId: number;
  email: string;
  website?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        email = ?,
        website = COALESCE(?, website),
        enrichment_status = 'EMAIL_FOUND',
        contact_method = 'EMAIL',
        status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [
      input.email.trim().toLowerCase(),
      input.website?.trim() ?? null,
      LEAD_STATUS_READY_TO_REVIEW,
      input.leadId,
    ],
  });
}

export async function countUkAutopilotQueue(): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM leads WHERE ${UK_AUTOPILOT_QUEUE_SQL}`,
  });
  return Number(result.rows[0]?.c ?? 0);
}

export async function countUkFormsSubmitted(): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    `SELECT COUNT(*) AS c FROM leads WHERE status = 'form_submitted'`,
  );
  return Number(result.rows[0]?.c ?? 0);
}
