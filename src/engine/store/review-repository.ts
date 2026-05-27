import { getDb } from "./db.js";

export interface ReviewDraft {
  id: number;
  business_name: string;
  fsa_rating: number | null;
  draft_message: string;
  postcode: string;
  lead_score: number;
}

export async function getDraftsForReview(): Promise<ReviewDraft[]> {
  const db = getDb();
  const result = await db.execute(`
    SELECT id, business_name, fsa_rating, draft_message, postcode, lead_score
    FROM leads
    WHERE draft_message IS NOT NULL AND status = 'drafted'
    ORDER BY lead_score DESC
  `);
  return result.rows as unknown as ReviewDraft[];
}

export async function approveDraft(
  id: number,
  draftMessage: string,
): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET draft_message = ?, status = 'approved', updated_at = datetime('now')
      WHERE id = ? AND status = 'drafted'
    `,
    args: [draftMessage.trim(), id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function rejectDraft(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET status = 'rejected', updated_at = datetime('now')
      WHERE id = ? AND status = 'drafted'
    `,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Postbox action: move a drafted lead into the approved/send pool without editing the draft.
 * Safe no-op unless status is 'drafted' and a draft_message exists.
 */
export async function queueLeadToPostbox(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      UPDATE leads
      SET status = 'approved', updated_at = datetime('now')
      WHERE id = ?
        AND status = 'drafted'
        AND draft_message IS NOT NULL
        AND email IS NOT NULL
        AND TRIM(email) != ''
    `,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
