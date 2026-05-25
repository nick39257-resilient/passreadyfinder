import { productConfig } from "../../config/product.config.js";
import { getDb } from "./db.js";

export interface ApprovedLead {
  id: number;
  business_name: string;
  email: string | null;
  draft_message: string;
  touch_count: number;
}

const maxTouches = productConfig.outreach.maxTouchesPerLead;

export async function getApprovedLeads(): Promise<ApprovedLead[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, business_name, email, draft_message, COALESCE(touch_count, 0) AS touch_count
      FROM leads
      WHERE status = 'approved'
        AND draft_message IS NOT NULL
        AND COALESCE(touch_count, 0) < ?
      ORDER BY lead_score DESC
    `,
    args: [maxTouches],
  });
  return result.rows as unknown as ApprovedLead[];
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
