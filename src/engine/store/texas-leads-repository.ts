import { getDb } from "./db.js";
import type { TexasLeadInput } from "../../types/texas.js";
import type { MobileVendorTier } from "../../types/texas.js";
import { renderHb2844DraftForLead } from "./texas-outreach-repository.js";

export interface TexasLeadRow {
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
  owner_name: string | null;
  apollo_enriched_at: string | null;
  contact_form_page_url: string | null;
  outreach_sent_at: string | null;
  resend_message_id: string | null;
  inspection_score: number | null;
  demerits: number | null;
  vehicle_type: string | null;
  is_mobile_vendor: number;
  vendor_tier: string | null;
  dshs_license_status: string;
  risk_score: number;
  intervention_level: string | null;
  last_inspection_date: string | null;
  status: string;
  draft_message: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: Record<string, unknown>): TexasLeadRow {
  return row as unknown as TexasLeadRow;
}

export async function upsertTexasLead(input: TexasLeadInput): Promise<number> {
  const db = getDb();
  const draftMessage = input.isMobileVendor
    ? renderHb2844DraftForLead({
        ownerName: input.ownerName,
        businessName: input.businessName,
      })
    : null;

  await db.execute({
    sql: `INSERT INTO texas_leads (
      external_id, source, region, business_name, address, city, county, zip,
      phone, email, website, owner_name, inspection_score, demerits, vehicle_type,
      is_mobile_vendor, vendor_tier, dshs_license_status, risk_score,
      intervention_level, last_inspection_date, draft_message, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(external_id, source) DO UPDATE SET
      business_name = excluded.business_name,
      address = excluded.address,
      city = excluded.city,
      county = excluded.county,
      zip = excluded.zip,
      phone = COALESCE(excluded.phone, phone),
      email = COALESCE(excluded.email, email),
      website = COALESCE(excluded.website, website),
      owner_name = COALESCE(excluded.owner_name, owner_name),
      inspection_score = excluded.inspection_score,
      demerits = excluded.demerits,
      vehicle_type = excluded.vehicle_type,
      is_mobile_vendor = excluded.is_mobile_vendor,
      vendor_tier = excluded.vendor_tier,
      dshs_license_status = excluded.dshs_license_status,
      risk_score = excluded.risk_score,
      intervention_level = excluded.intervention_level,
      last_inspection_date = excluded.last_inspection_date,
      draft_message = CASE
        WHEN excluded.is_mobile_vendor = 1 THEN excluded.draft_message
        ELSE draft_message
      END,
      updated_at = datetime('now')`,
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
      input.website,
      input.ownerName,
      input.inspectionScore,
      input.demerits,
      input.vehicleType,
      input.isMobileVendor ? 1 : 0,
      input.vendorTier,
      input.dshsLicenseStatus,
      input.riskScore,
      input.interventionLevel,
      input.lastInspectionDate,
      draftMessage,
    ],
  });

  const lookup = await db.execute({
    sql: `SELECT id FROM texas_leads WHERE external_id = ? AND source = ?`,
    args: [input.externalId, input.source],
  });
  const id = lookup.rows[0]?.id;
  return typeof id === "number" ? id : Number(id);
}

export type TexasLeadSegment = "all" | "mobile" | "hasEmail";

const TEXAS_READY_FOR_OUTREACH_SQL = `
  email IS NOT NULL AND TRIM(email) != ''
  AND status NOT IN ('EMAIL_SENT', 'FORM_SUBMITTED')
`;

function whereClauseForTexasSegment(segment: TexasLeadSegment): string {
  if (segment === "mobile") {
    return "WHERE is_mobile_vendor = 1";
  }
  if (segment === "hasEmail") {
    return `WHERE ${TEXAS_READY_FOR_OUTREACH_SQL}`;
  }
  return "";
}

export async function getAllTexasLeads(options?: {
  /** @deprecated Prefer segment */
  mobileOnly?: boolean;
  segment?: TexasLeadSegment;
}): Promise<TexasLeadRow[]> {
  const db = getDb();
  const segment =
    options?.segment ?? (options?.mobileOnly ? "mobile" : "all");
  const where = whereClauseForTexasSegment(segment);
  const result = await db.execute(
    `SELECT * FROM texas_leads ${where} ORDER BY risk_score DESC, updated_at DESC`,
  );
  return result.rows.map((r) => rowToRecord(r as Record<string, unknown>));
}

export async function getTexasLeadById(id: number): Promise<TexasLeadRow | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM texas_leads WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToRecord(row as Record<string, unknown>) : null;
}

export async function updateTexasMobileLeadMetadata(input: {
  leadId: number;
  isMobileVendor: boolean;
  vendorTier: MobileVendorTier;
  ownerName: string | null;
  businessName: string;
}): Promise<void> {
  const db = getDb();
  const draftMessage = renderHb2844DraftForLead({
    ownerName: input.ownerName,
    businessName: input.businessName,
  });

  await db.execute({
    sql: `
      UPDATE texas_leads SET
        is_mobile_vendor = 1,
        vendor_tier = ?,
        draft_message = ?,
        status = CASE WHEN status = 'new' THEN 'ready_to_review' ELSE status END,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.vendorTier, draftMessage, input.leadId],
  });
}

export async function updateTexasLeadEmailFromApollo(input: {
  leadId: number;
  email: string;
  ownerName: string | null;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE texas_leads SET
        email = ?,
        owner_name = COALESCE(?, owner_name),
        apollo_enriched_at = datetime('now'),
        status = CASE WHEN status = 'new' THEN 'ready_to_review' ELSE status END,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.email.trim().toLowerCase(), input.ownerName?.trim() ?? null, input.leadId],
  });
}

export async function markTexasApolloEnrichmentAttempted(leadId: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE texas_leads SET
        apollo_enriched_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [leadId],
  });
}

/**
 * Texas leads missing email, not yet Apollo-attempted.
 * Critical intervention (≥79) first, then highest risk_score.
 */
export async function getTexasLeadsNeedingApolloEnrichment(
  limit: number,
  options?: { retryAttempted?: boolean },
): Promise<TexasLeadRow[]> {
  const db = getDb();
  const attemptedClause = options?.retryAttempted
    ? ""
    : "AND apollo_enriched_at IS NULL";
  const result = await db.execute({
    sql: `
      SELECT * FROM texas_leads
      WHERE (email IS NULL OR TRIM(email) = '')
        AND status NOT IN ('EMAIL_SENT', 'FORM_SUBMITTED')
        ${attemptedClause}
      ORDER BY
        CASE WHEN intervention_level = 'CRITICAL_INTERVENTION' THEN 0 ELSE 1 END,
        risk_score DESC,
        id ASC
      LIMIT ?
    `,
    args: [limit],
  });
  return result.rows.map((r) => rowToRecord(r as Record<string, unknown>));
}

export async function markTexasLeadEmailSent(input: {
  leadId: number;
  resendId: string;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE texas_leads SET
        status = 'EMAIL_SENT',
        resend_message_id = ?,
        outreach_sent_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.resendId, input.leadId],
  });
}

export async function markTexasLeadFormSubmitted(input: {
  leadId: number;
  contactPageUrl: string | null;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE texas_leads SET
        status = 'FORM_SUBMITTED',
        contact_form_page_url = ?,
        outreach_sent_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.contactPageUrl, input.leadId],
  });
}

export async function countTexasLeads(): Promise<{
  total: number;
  mobile: number;
  critical: number;
  readyToSend: number;
}> {
  const db = getDb();
  const total = await db.execute(`SELECT COUNT(*) AS c FROM texas_leads`);
  const mobile = await db.execute(
    `SELECT COUNT(*) AS c FROM texas_leads WHERE is_mobile_vendor = 1`,
  );
  const critical = await db.execute(
    `SELECT COUNT(*) AS c FROM texas_leads WHERE intervention_level = 'CRITICAL_INTERVENTION'`,
  );
  const readyToSend = await db.execute(
    `SELECT COUNT(*) AS c FROM texas_leads WHERE ${TEXAS_READY_FOR_OUTREACH_SQL}`,
  );
  return {
    total: Number(total.rows[0]?.c ?? 0),
    mobile: Number(mobile.rows[0]?.c ?? 0),
    critical: Number(critical.rows[0]?.c ?? 0),
    readyToSend: Number(readyToSend.rows[0]?.c ?? 0),
  };
}
