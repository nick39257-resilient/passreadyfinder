import { getDb } from "./db.js";

export interface LeadStatusCounts {
  new: number;
  drafted: number;
  approved: number;
  contacted: number;
  opted_in: number;
  nurture: number;
  suppressed: number;
  replied: number;
  trial_started: number;
}

const TRACKED_STATUSES = [
  "new",
  "drafted",
  "approved",
  "contacted",
  "opted_in",
  "nurture",
  "suppressed",
  "replied",
  "trial_started",
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
    nurture: 0,
    suppressed: 0,
    replied: 0,
    trial_started: 0,
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

export interface FunnelStats {
  identified: number;
  drafted: number;
  approved: number;
  converted: number;
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const db = getDb();
  const result = await db.execute(`
    SELECT
      COUNT(*) AS identified,
      SUM(CASE WHEN status IN ('drafted', 'approved', 'contacted', 'nurture', 'opted_in') THEN 1 ELSE 0 END) AS drafted,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status IN ('contacted', 'opted_in') THEN 1 ELSE 0 END) AS converted
    FROM leads
  `);
  const row = result.rows[0];
  return {
    identified: Number(row?.identified ?? 0),
    drafted: Number(row?.drafted ?? 0),
    approved: Number(row?.approved ?? 0),
    converted: Number(row?.converted ?? 0),
  };
}

export { TRACKED_STATUSES };
