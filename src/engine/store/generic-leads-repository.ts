import { getDb } from "./db.js";

export interface GenericLeadRow {
  id: number;
  market_id: string;
  run_id: string | null;
  external_id: string;
  keyword: string | null;
  location_label: string;
  business_name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  gap_reasons: string | null;
  priority_score: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GenericLeadUpsertInput {
  marketId: string;
  runId?: string | null;
  externalId: string;
  keyword?: string | null;
  locationLabel: string;
  businessName: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  gapReasons?: string[];
  priorityScore: number;
}

export async function upsertGenericLead(input: GenericLeadUpsertInput): Promise<void> {
  const db = getDb();
  const gapsJson = input.gapReasons?.length
    ? JSON.stringify(input.gapReasons)
    : null;

  await db.execute({
    sql: `
      INSERT INTO generic_leads (
        market_id, run_id, external_id, keyword, location_label,
        business_name, address, city, postcode, latitude, longitude,
        phone, website, email, gap_reasons, priority_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(market_id, external_id) DO UPDATE SET
        run_id = COALESCE(excluded.run_id, generic_leads.run_id),
        keyword = COALESCE(excluded.keyword, generic_leads.keyword),
        location_label = excluded.location_label,
        business_name = excluded.business_name,
        address = COALESCE(excluded.address, generic_leads.address),
        city = COALESCE(excluded.city, generic_leads.city),
        postcode = COALESCE(excluded.postcode, generic_leads.postcode),
        latitude = COALESCE(excluded.latitude, generic_leads.latitude),
        longitude = COALESCE(excluded.longitude, generic_leads.longitude),
        phone = COALESCE(excluded.phone, generic_leads.phone),
        website = COALESCE(excluded.website, generic_leads.website),
        email = COALESCE(excluded.email, generic_leads.email),
        gap_reasons = COALESCE(excluded.gap_reasons, generic_leads.gap_reasons),
        priority_score = MAX(generic_leads.priority_score, excluded.priority_score),
        updated_at = datetime('now')
    `,
    args: [
      input.marketId,
      input.runId ?? null,
      input.externalId,
      input.keyword ?? null,
      input.locationLabel,
      input.businessName,
      input.address ?? null,
      input.city ?? null,
      input.postcode ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.phone ?? null,
      input.website ?? null,
      input.email ?? null,
      gapsJson,
      input.priorityScore,
    ],
  });
}

export async function listGenericLeads(options?: {
  marketId?: string;
  runId?: string;
  limit?: number;
}): Promise<GenericLeadRow[]> {
  const db = getDb();
  const clauses: string[] = [];
  const args: (string | number)[] = [];

  if (options?.marketId) {
    clauses.push("market_id = ?");
    args.push(options.marketId);
  }
  if (options?.runId) {
    clauses.push("run_id = ?");
    args.push(options.runId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = options?.limit ?? 500;

  const result = await db.execute({
    sql: `
      SELECT * FROM generic_leads
      ${where}
      ORDER BY priority_score DESC, id DESC
      LIMIT ?
    `,
    args: [...args, limit],
  });

  return result.rows as unknown as GenericLeadRow[];
}

export async function countGenericLeadsByRun(runId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM generic_leads WHERE run_id = ?`,
    args: [runId],
  });
  return Number(result.rows[0]?.c ?? 0);
}
