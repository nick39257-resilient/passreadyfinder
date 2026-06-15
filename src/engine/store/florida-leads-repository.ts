import type { FloridaLeadInput } from "../../types/florida.js";
import { floridaLocationSearchTokens } from "../florida/florida-location-tokens.js";
import { getDb } from "./db.js";

export interface FloridaLeadRow {
  id: number;
  external_id: string;
  source: string;
  region: string;
  business_name: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  license_type: string | null;
  risk_level: string | null;
  inspection_score: number | null;
  priority_violations: number | null;
  last_inspection_date: string | null;
  risk_score: number;
  status: string;
  draft_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertFloridaLead(input: FloridaLeadInput): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO florida_leads (
        external_id, source, region, business_name, address, city, county, zip,
        phone, email, license_number, license_type, risk_level,
        inspection_score, priority_violations, last_inspection_date,
        risk_score, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(external_id, source) DO UPDATE SET
        business_name = excluded.business_name,
        address = COALESCE(excluded.address, florida_leads.address),
        city = COALESCE(excluded.city, florida_leads.city),
        county = COALESCE(excluded.county, florida_leads.county),
        zip = COALESCE(excluded.zip, florida_leads.zip),
        phone = COALESCE(excluded.phone, florida_leads.phone),
        email = COALESCE(excluded.email, florida_leads.email),
        license_number = COALESCE(excluded.license_number, florida_leads.license_number),
        license_type = COALESCE(excluded.license_type, florida_leads.license_type),
        risk_level = COALESCE(excluded.risk_level, florida_leads.risk_level),
        inspection_score = COALESCE(excluded.inspection_score, florida_leads.inspection_score),
        priority_violations = COALESCE(excluded.priority_violations, florida_leads.priority_violations),
        last_inspection_date = COALESCE(excluded.last_inspection_date, florida_leads.last_inspection_date),
        risk_score = excluded.risk_score,
        status = excluded.status,
        updated_at = datetime('now')
    `,
    args: [
      input.externalId,
      input.source,
      input.region,
      input.businessName,
      input.address,
      input.city,
      input.county,
      input.zip,
      input.phone,
      input.email,
      input.licenseNumber,
      input.licenseType,
      input.riskLevel,
      input.inspectionScore,
      input.priorityViolations,
      input.lastInspectionDate,
      input.riskScore,
      input.status,
    ],
  });
}

export async function listFloridaLeads(
  limit = 500,
  filter?: { location?: string },
): Promise<FloridaLeadRow[]> {
  const db = getDb();
  const location = filter?.location?.trim();

  if (location) {
    const searchParts = floridaLocationSearchTokens(location);
    if (searchParts.length === 0) {
      const result = await db.execute({
        sql: `SELECT * FROM florida_leads ORDER BY risk_score DESC, id DESC LIMIT ?`,
        args: [Math.min(limit, 500)],
      });
      return result.rows as unknown as FloridaLeadRow[];
    }

    const conditions = searchParts
      .map(() => `(LOWER(city) LIKE ? OR LOWER(county) LIKE ? OR LOWER(address) LIKE ?)`)
      .join(" OR ");
    const args: string[] = [];
    for (const part of searchParts) {
      const like = `%${part.replace(/\./g, "")}%`;
      args.push(like, like, like);
    }
    args.push(String(Math.min(limit, 500)));

    const result = await db.execute({
      sql: `
        SELECT * FROM florida_leads
        WHERE ${conditions}
        ORDER BY risk_score DESC, id DESC
        LIMIT ?
      `,
      args,
    });
    return result.rows as unknown as FloridaLeadRow[];
  }

  const result = await db.execute({
    sql: `SELECT * FROM florida_leads ORDER BY risk_score DESC, id DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as FloridaLeadRow[];
}
