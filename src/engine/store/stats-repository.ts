import { getDb } from "./db.js";

export interface LeadStatusCounts {
  new: number;
  drafted: number;
  approved: number;
  contacted: number;
  opted_in: number;
}

const TRACKED_STATUSES = [
  "new",
  "drafted",
  "approved",
  "contacted",
  "opted_in",
] as const;

export async function getLeadStatusCounts(): Promise<LeadStatusCounts> {
  const db = getDb();
  const result = await db.execute(`
    SELECT status, COUNT(*) AS count
    FROM leads
    GROUP BY status
  `);

  const counts: LeadStatusCounts = {
    new: 0,
    drafted: 0,
    approved: 0,
    contacted: 0,
    opted_in: 0,
  };

  for (const row of result.rows) {
    const status = row.status as string;
    const count = Number(row.count);
    if (status in counts) {
      counts[status as keyof LeadStatusCounts] = count;
    }
  }

  return counts;
}

export async function countApprovedLeads(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS count
    FROM leads
    WHERE status = 'approved' AND draft_message IS NOT NULL
  `);
  return Number(result.rows[0]?.count ?? 0);
}

export { TRACKED_STATUSES };
