import type { FloridaLeadInput } from "../../types/florida.js";
import { floridaLocationSearchTokens } from "../florida/florida-location-tokens.js";
import { floridaProductConfig } from "../../config/product.florida.config.js";
import { isValidOutreachEmail } from "../outreach-email.js";
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
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  license_number: string | null;
  license_type: string | null;
  risk_level: string | null;
  inspection_score: number | null;
  priority_violations: number | null;
  last_inspection_date: string | null;
  risk_score: number;
  status: string;
  enrichment_status: string | null;
  enrichment_detail: string | null;
  enriched_at: string | null;
  draft_message: string | null;
  outreach_sent_at: string | null;
  resend_message_id: string | null;
  created_at: string;
  updated_at: string;
}

const FLORIDA_NEEDS_ENRICHMENT_SQL = `
  (email IS NULL OR TRIM(email) = '')
  AND (facebook_url IS NULL OR TRIM(facebook_url) = '')
  AND (instagram_url IS NULL OR TRIM(instagram_url) = '')
  AND status NOT IN ('EMAIL_SENT', 'outreach_sent')
  AND COALESCE(enrichment_status, 'pending') IN ('pending', 'failed', 'no_contact')
`;

function buildFloridaOutreachDraft(row: Pick<FloridaLeadRow, "business_name" | "city" | "county">): string {
  const place = [row.city, row.county].filter(Boolean).join(", ") || "Florida";
  const scoreUrl = floridaProductConfig.outreach.scoreUrl;
  const siteUrl = floridaProductConfig.outreach.siteUrl;
  return `Hi ${row.business_name} team,

PassReady helps Florida food operators close DBPR inspection gaps before the next visit. We flagged recent inspection activity in ${place} and can share a free readiness score.

${scoreUrl}

Learn more: ${siteUrl}

Best,
Nick Clark, PassReady US Compliance Desk`;
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
        status = CASE
          WHEN florida_leads.status = 'ready_to_contact' THEN florida_leads.status
          ELSE excluded.status
        END,
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

export async function getFloridaLeadById(id: number): Promise<FloridaLeadRow | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM florida_leads WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as FloridaLeadRow;
}

export async function listFloridaLeadsNeedingEnrichment(
  limit: number,
  filter?: { location?: string },
): Promise<FloridaLeadRow[]> {
  const db = getDb();
  const location = filter?.location?.trim();

  if (location) {
    const searchParts = floridaLocationSearchTokens(location);
    if (searchParts.length > 0) {
      const locationConditions = searchParts
        .map(() => `(LOWER(city) LIKE ? OR LOWER(county) LIKE ? OR LOWER(address) LIKE ?)`)
        .join(" OR ");
      const args: string[] = [];
      for (const part of searchParts) {
        const like = `%${part.replace(/\./g, "")}%`;
        args.push(like, like, like);
      }
      args.push(String(Math.min(limit, 120)));

      const result = await db.execute({
        sql: `
          SELECT * FROM florida_leads
          WHERE ${FLORIDA_NEEDS_ENRICHMENT_SQL}
            AND (${locationConditions})
          ORDER BY risk_score DESC, id ASC
          LIMIT ?
        `,
        args,
      });
      return result.rows as unknown as FloridaLeadRow[];
    }
  }

  const result = await db.execute({
    sql: `
      SELECT * FROM florida_leads
      WHERE ${FLORIDA_NEEDS_ENRICHMENT_SQL}
      ORDER BY risk_score DESC, id ASC
      LIMIT ?
    `,
    args: [Math.min(limit, 120)],
  });
  return result.rows as unknown as FloridaLeadRow[];
}

export async function applyFloridaEnrichmentResult(input: {
  leadId: number;
  email: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  status: "ready_to_contact" | "no_contact" | "skipped_has_contact";
  enrichmentDetail: string;
}): Promise<void> {
  const db = getDb();
  const row = await getFloridaLeadById(input.leadId);
  if (!row) {
    return;
  }

  const email =
    input.email?.trim() && isValidOutreachEmail(input.email)
      ? input.email.trim().toLowerCase()
      : null;
  const facebookUrl = input.facebookUrl?.trim() ?? null;
  const instagramUrl = input.instagramUrl?.trim() ?? null;
  const website = input.website?.trim() ?? null;
  const ready =
    input.status === "ready_to_contact" ||
    Boolean(email || facebookUrl || instagramUrl);
  const nextStatus = ready ? "ready_to_contact" : row.status;
  const enrichmentStatus = ready ? "ready" : "no_contact";
  const draft =
    ready && !row.draft_message?.trim()
      ? buildFloridaOutreachDraft(row)
      : row.draft_message;

  await db.execute({
    sql: `
      UPDATE florida_leads SET
        email = COALESCE(?, email),
        website = COALESCE(?, website),
        facebook_url = COALESCE(?, facebook_url),
        instagram_url = COALESCE(?, instagram_url),
        status = ?,
        enrichment_status = ?,
        enrichment_detail = ?,
        enriched_at = datetime('now'),
        draft_message = COALESCE(?, draft_message),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [
      email,
      website,
      facebookUrl,
      instagramUrl,
      nextStatus,
      enrichmentStatus,
      input.enrichmentDetail.slice(0, 900),
      draft,
      input.leadId,
    ],
  });
}

export async function markFloridaLeadOutreachSent(input: {
  leadId: number;
  resendId: string;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE florida_leads SET
        status = 'EMAIL_SENT',
        outreach_sent_at = datetime('now'),
        resend_message_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.resendId, input.leadId],
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
