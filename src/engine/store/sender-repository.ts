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

export interface ApprovedLead {
  id: number;
  business_name: string;
  email: string | null;
  draft_message: string;
  touch_count: number;
  replied_at: string | null;
}

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

export async function getApprovedLeads(limit?: number): Promise<ApprovedLead[]> {
  const db = getDb();
  const sql = `
      SELECT id, business_name, email, draft_message, COALESCE(touch_count, 0) AS touch_count, replied_at, status
      FROM leads
      WHERE status = 'approved'
        AND draft_message IS NOT NULL
        AND email IS NOT NULL
        AND TRIM(email) != ''
        AND COALESCE(touch_count, 0) < ?
        AND ${outreachHaltedSqlInClause()}
        AND ${emailNotSuppressedSql("leads")}
      ORDER BY lead_score DESC
      ${limit !== undefined ? "LIMIT ?" : ""}
    `;
  const args =
    limit !== undefined
      ? [maxTouches, ...outreachHaltedSqlArgs(), limit]
      : [maxTouches, ...outreachHaltedSqlArgs()];
  const result = await db.execute({ sql, args });
  const rows = result.rows as unknown as (ApprovedLead & { status?: string })[];
  return rows.filter(
    (row) => !isLeadOutreachHalted(row) && isValidOutreachEmail(row.email),
  );
}

/** Post-fetch guard: block sends when email is on suppression_list. */
export async function filterLeadsAllowedToSend(
  leads: ApprovedLead[],
): Promise<{ allowed: ApprovedLead[]; skippedSuppressed: number }> {
  const allowed: ApprovedLead[] = [];
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
  const maxTouches = productConfig.outreach.maxTouchesPerLead;

  await db.batch(
    [
      {
        sql: `
          UPDATE leads
          SET
            touch_count = COALESCE(touch_count, 0) + 1,
            status = CASE
              WHEN COALESCE(touch_count, 0) + 1 >= ? THEN 'nurture'
              ELSE 'contacted'
            END,
            contacted_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ? AND status = 'approved'
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
