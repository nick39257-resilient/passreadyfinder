import { getDb } from "./db.js";

export interface ApprovedLead {
  id: number;
  business_name: string;
  email: string | null;
  draft_message: string;
}

export async function getApprovedLeads(): Promise<ApprovedLead[]> {
  const db = getDb();
  const result = await db.execute(`
    SELECT id, business_name, email, draft_message
    FROM leads
    WHERE status = 'approved' AND draft_message IS NOT NULL
    ORDER BY lead_score DESC
  `);
  return result.rows as unknown as ApprovedLead[];
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
          SET status = 'contacted', contacted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status = 'approved'
        `,
        args: [leadId],
      },
      {
        sql: `
          INSERT INTO email_events (lead_id, event_type, resend_id, detail)
          VALUES (?, 'sent', ?, 'Phase D sender')
        `,
        args: [leadId, resendId],
      },
    ],
    "write",
  );
}
