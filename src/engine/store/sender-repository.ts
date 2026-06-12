import { productConfig } from "../../config/product.config.js";
import {
  emailNotSuppressedSql,
  isLeadOutreachHalted,
  isEmailSuppressed,
  isValidOutreachEmail,
  normalizeOutreachEmail,
  outreachHaltedSqlArgs,
  outreachHaltedSqlInClause,
} from "../outreach-halt.js";
import { getDb } from "./db.js";

export const OUTBOUND_BATCH_LIMIT = 50;

export interface ApprovedLead {
  id: number;
  business_name: string;
  email: string | null;
  draft_message: string;
  touch_count: number;
  replied_at: string | null;
}

export interface OutboundQueueLead extends ApprovedLead {
  status?: string | null;
  address: string;
  local_authority_name: string | null;
  owner_name: string | null;
  postcode: string | null;
}

/** Leads approved for the next outbound touch (first or follow-up sequence). */
const OUTBOUND_QUEUE_WHERE = `
  status = 'ready_to_contact'
  AND draft_message IS NOT NULL
  AND email IS NOT NULL
  AND TRIM(email) != ''
  AND COALESCE(touch_count, 0) < ?
  AND ${outreachHaltedSqlInClause()}
  AND ${emailNotSuppressedSql("leads")}
`;

const OUTBOUND_SELECT_COLUMNS = `
  id, business_name, email, draft_message, status,
  COALESCE(touch_count, 0) AS touch_count,
  replied_at, address, local_authority_name, owner_name, postcode
`;

export async function countSendsTodayUtc(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS count
    FROM email_events
    WHERE event_type = 'sent'
      AND date(created_at) = date('now')
  `);
  return Number(result.rows[0]?.count ?? 0);
}

const maxTouches = productConfig.outreach.maxTouchesPerLead;

/** Leads waiting in the outbound queue (not yet claimed). */
export async function countReadyToContactLeads(): Promise<number> {
  const rows = await getReadyToContactLeads();
  return rows.length;
}

export async function getReadyToContactLeads(limit?: number): Promise<OutboundQueueLead[]> {
  const db = getDb();
  const sql = `
    SELECT ${OUTBOUND_SELECT_COLUMNS}
    FROM leads
    WHERE ${OUTBOUND_QUEUE_WHERE}
    ORDER BY lead_score DESC
    ${limit !== undefined ? "LIMIT ?" : ""}
  `;
  const args =
    limit !== undefined
      ? [maxTouches, ...outreachHaltedSqlArgs(), limit]
      : [maxTouches, ...outreachHaltedSqlArgs()];
  const result = await db.execute({ sql, args });
  const rows = result.rows as unknown as OutboundQueueLead[];
  return rows.filter(
    (row) => !isLeadOutreachHalted(row) && isValidOutreachEmail(row.email),
  );
}

/** @deprecated Use getReadyToContactLeads — kept for stats/diagnostics aliases. */
export async function getApprovedLeads(limit?: number): Promise<ApprovedLead[]> {
  return getReadyToContactLeads(limit);
}

function processingStaleMinutes(): number {
  const fromEnv = Number(process.env.OUTBOUND_PROCESSING_STALE_MINUTES);
  if (Number.isFinite(fromEnv) && fromEnv >= 60) {
    return fromEnv;
  }
  // Max batch (50) × 4 min delay ≈ 200 min; keep reclaim beyond send job timeout (4h).
  return 300;
}

/** Reset processing rows stuck longer than maxAgeMinutes (crashed send batches). */
export async function reclaimStaleProcessingLeads(
  maxAgeMinutes = processingStaleMinutes(),
): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET status = 'ready_to_contact', updated_at = datetime('now')
      WHERE status = 'processing'
        AND datetime(updated_at) < datetime('now', ?)
    `,
    args: [`-${maxAgeMinutes} minutes`],
  });
  return result.rowsAffected ?? 0;
}

/**
 * Atomically claim up to `limit` ready leads and lock them as processing.
 * Uses UPDATE … RETURNING so overlapping cron jobs cannot grab the same rows.
 */
export async function claimReadyToContactBatch(
  limit = OUTBOUND_BATCH_LIMIT,
): Promise<OutboundQueueLead[]> {
  await reclaimStaleProcessingLeads();

  const db = getDb();
  const batchCap = Math.min(limit, OUTBOUND_BATCH_LIMIT);
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET status = 'processing', updated_at = datetime('now')
      WHERE id IN (
        SELECT id FROM leads
        WHERE ${OUTBOUND_QUEUE_WHERE}
        ORDER BY lead_score DESC
        LIMIT ?
      )
      AND status = 'ready_to_contact'
      RETURNING ${OUTBOUND_SELECT_COLUMNS}
    `,
    args: [maxTouches, ...outreachHaltedSqlArgs(), batchCap],
  });

  const rows = result.rows as unknown as OutboundQueueLead[];
  return rows.filter(
    (row) => !isLeadOutreachHalted(row) && isValidOutreachEmail(row.email),
  );
}

export async function revertLeadToReadyToContact(leadId: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads
      SET status = 'ready_to_contact', updated_at = datetime('now')
      WHERE id = ? AND status = 'processing'
    `,
    args: [leadId],
  });
}

export async function markLeadFailedDelivery(leadId: number, detail: string): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      {
        sql: `
          UPDATE leads
          SET status = 'failed_delivery', updated_at = datetime('now')
          WHERE id = ? AND status = 'processing'
        `,
        args: [leadId],
      },
      {
        sql: `
          INSERT INTO email_events (lead_id, event_type, detail)
          VALUES (?, 'bounce', ?)
        `,
        args: [leadId, detail.slice(0, 500)],
      },
    ],
    "write",
  );
}

/** Post-fetch guard: block sends when email is on suppression_list. */
export async function filterLeadsAllowedToSend<T extends ApprovedLead>(
  leads: T[],
): Promise<{ allowed: T[]; skippedSuppressed: number }> {
  const allowed: T[] = [];
  let skippedSuppressed = 0;

  for (const lead of leads) {
    const testAddress = normalizeOutreachEmail(lead.email);
    if (testAddress && (await isEmailSuppressed(testAddress))) {
      skippedSuppressed++;
      continue;
    }
    allowed.push(lead);
  }

  return { allowed, skippedSuppressed };
}

export async function markLeadReplied(leadId: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET replied_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND replied_at IS NULL
    `,
    args: [leadId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function markLeadContacted(
  leadId: number,
  resendId: string,
): Promise<void> {
  const db = getDb();

  await db.batch(
    [
      {
        sql: `
          UPDATE leads
          SET
            touch_count = COALESCE(touch_count, 0) + 1,
            email_sent_at = datetime('now'),
            status = CASE
              WHEN COALESCE(touch_count, 0) + 1 >= ? THEN 'nurture'
              ELSE 'contacted'
            END,
            contacted_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ? AND status = 'processing'
        `,
        args: [maxTouches, leadId],
      },
      {
        sql: `
          INSERT INTO email_events (lead_id, event_type, resend_id, detail)
          VALUES (?, 'sent', ?, 'Constitution sender')
        `,
        args: [leadId, resendId],
      },
    ],
    "write",
  );
}

export async function logEmailBounce(leadId: number, resendId: string, detail: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO email_events (lead_id, event_type, resend_id, detail)
      VALUES (?, 'bounce', ?, ?)
    `,
    args: [leadId, resendId, detail],
  });
}
