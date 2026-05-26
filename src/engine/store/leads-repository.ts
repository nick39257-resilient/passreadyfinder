import type { DeliveryAppStatus } from "../../types/lead.js";
import type { RawLead } from "../../types/fsa.js";
import { getDb } from "./db.js";

export interface LeadUpsertInput extends RawLead {
  phone?: string | null;
  website?: string | null;
  onDeliveryApp?: DeliveryAppStatus;
  leadScore: number;
}

export async function upsertLead(input: LeadUpsertInput): Promise<void> {
  const db = getDb();

  await db.execute({
    sql: `
      INSERT INTO leads (
        fsa_id, business_name, business_type, address, postcode,
        latitude, longitude, fsa_rating, fsa_last_inspection_date,
        fsa_score_hygiene, fsa_score_structural, fsa_score_management,
        phone, website, on_delivery_app, lead_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(fsa_id) DO UPDATE SET
        business_name = excluded.business_name,
        business_type = excluded.business_type,
        address = excluded.address,
        postcode = excluded.postcode,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        fsa_rating = excluded.fsa_rating,
        fsa_last_inspection_date = excluded.fsa_last_inspection_date,
        fsa_score_hygiene = COALESCE(excluded.fsa_score_hygiene, leads.fsa_score_hygiene),
        fsa_score_structural = COALESCE(excluded.fsa_score_structural, leads.fsa_score_structural),
        fsa_score_management = COALESCE(excluded.fsa_score_management, leads.fsa_score_management),
        phone = COALESCE(excluded.phone, leads.phone),
        website = COALESCE(excluded.website, leads.website),
        on_delivery_app = excluded.on_delivery_app,
        lead_score = excluded.lead_score,
        updated_at = datetime('now')
    `,
    args: [
      input.fsaId,
      input.businessName,
      input.businessType,
      input.address,
      input.postcode,
      input.latitude,
      input.longitude,
      input.fsaRating,
      input.fsaLastInspectionDate,
      input.fsaScoreHygiene ?? null,
      input.fsaScoreStructural ?? null,
      input.fsaScoreManagement ?? null,
      input.phone ?? null,
      input.website ?? null,
      input.onDeliveryApp ?? "unknown",
      input.leadScore,
    ],
  });
}

export async function updateLeadEnrichment(
  fsaId: number,
  enrichment: {
    phone: string | null;
    website: string | null;
    onDeliveryApp: DeliveryAppStatus;
    leadScore: number;
  },
): Promise<void> {
  const db = getDb();

  await db.execute({
    sql: `
      UPDATE leads SET
        phone = ?,
        website = ?,
        on_delivery_app = ?,
        lead_score = ?,
        updated_at = datetime('now')
      WHERE fsa_id = ?
    `,
    args: [
      enrichment.phone,
      enrichment.website,
      enrichment.onDeliveryApp,
      enrichment.leadScore,
      fsaId,
    ],
  });
}

export interface LeadRow {
  id: number;
  fsa_id: number;
  business_name: string;
  business_type: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  fsa_rating: number | null;
  fsa_last_inspection_date: string | null;
  fsa_score_hygiene?: number | null;
  fsa_score_structural?: number | null;
  fsa_score_management?: number | null;
  phone: string | null;
  website: string | null;
  on_delivery_app: DeliveryAppStatus;
  lead_score: number;
  status?: string;
  draft_message?: string | null;
  contacted_at?: string | null;
  touch_count?: number;
  created_at: string;
  updated_at: string;
}

export async function getAllLeads(): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute(`SELECT * FROM leads`);
  return result.rows as unknown as LeadRow[];
}

export async function getLeadById(id: number): Promise<LeadRow | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM leads WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as LeadRow;
}

export async function getTopLeads(limit: number): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM leads ORDER BY lead_score DESC, fsa_rating ASC LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as LeadRow[];
}

export async function getOsmCache(fsaId: number): Promise<{
  phone: string | null;
  website: string | null;
  on_delivery_app: DeliveryAppStatus;
} | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT phone, website, on_delivery_app FROM osm_cache WHERE fsa_id = ?`,
    args: [fsaId],
  });
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    phone: row.phone as string | null,
    website: row.website as string | null,
    on_delivery_app: row.on_delivery_app as DeliveryAppStatus,
  };
}

export async function setOsmCache(
  fsaId: number,
  data: {
    phone: string | null;
    website: string | null;
    onDeliveryApp: DeliveryAppStatus;
    rawResponse?: string;
  },
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO osm_cache (fsa_id, phone, website, on_delivery_app, queried_at, raw_response)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(fsa_id) DO UPDATE SET
        phone = excluded.phone,
        website = excluded.website,
        on_delivery_app = excluded.on_delivery_app,
        queried_at = datetime('now'),
        raw_response = excluded.raw_response
    `,
    args: [
      fsaId,
      data.phone,
      data.website,
      data.onDeliveryApp,
      data.rawResponse ?? null,
    ],
  });
}

export async function countLeads(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`SELECT COUNT(*) as count FROM leads`);
  return Number(result.rows[0].count);
}
