import { getDb } from "../store/db.js";

export interface LocalCompetitor {
  businessName: string;
  fsaRating: number | null;
  postcode: string;
}

function postcodeOutward(postcode: string): string {
  const trimmed = postcode.trim().toUpperCase();
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? trimmed.slice(0, 4);
}

/** Same outward postcode + business type, higher-rated neighbours (max 3). */
export async function findLocalCompetitors(
  lead: {
    id: number;
    postcode: string;
    business_type: string;
  },
  limit = 3,
): Promise<LocalCompetitor[]> {
  const db = getDb();
  const outward = postcodeOutward(lead.postcode);
  const result = await db.execute({
    sql: `
      SELECT business_name, fsa_rating, postcode
      FROM leads
      WHERE id != ?
        AND postcode LIKE ?
        AND business_type = ?
        AND fsa_rating IS NOT NULL
      ORDER BY fsa_rating IS NULL, fsa_rating DESC, lead_score DESC
      LIMIT ?
    `,
    args: [lead.id, `${outward}%`, lead.business_type, limit],
  });

  return result.rows.map((row) => ({
    businessName: String(row.business_name),
    fsaRating: row.fsa_rating === null ? null : Number(row.fsa_rating),
    postcode: String(row.postcode),
  }));
}

export async function countLocalPassReadyUsers(postcode: string): Promise<number> {
  const db = getDb();
  const outward = postcodeOutward(postcode);
  const result = await db.execute({
    sql: `
      SELECT COUNT(*) AS count
      FROM leads
      WHERE postcode LIKE ?
        AND status IN ('contacted', 'approved', 'opted_in')
    `,
    args: [`${outward}%`],
  });
  return Number(result.rows[0]?.count ?? 0);
}
