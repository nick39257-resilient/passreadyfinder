import type { ContactMethod, EnrichmentStatus } from "../../types/enrichment.js";
import { getDb } from "./db.js";

export async function setLeadEnrichmentPending(leadId: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        enrichment_status = 'PENDING',
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [leadId],
  });
}

export async function markLeadEmailFromApollo(input: {
  leadId: number;
  email: string;
  ownerName: string | null;
  status: string;
  contactMethod: ContactMethod;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        email = ?,
        owner_name = COALESCE(?, owner_name),
        enrichment_status = 'EMAIL_FOUND',
        contact_method = ?,
        status = ?,
        apollo_enriched_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [
      input.email.trim().toLowerCase(),
      input.ownerName?.trim() ?? null,
      input.contactMethod,
      input.status,
      input.leadId,
    ],
  });
}

export async function markLeadFormSubmitted(input: {
  leadId: number;
  contactPageUrl: string | null;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        enrichment_status = 'NO_EMAIL_FALLBACK',
        contact_method = 'CONTACT_FORM',
        status = 'form_submitted',
        contact_form_submitted_at = datetime('now'),
        contact_form_page_url = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [input.contactPageUrl, input.leadId],
  });
}

export async function markLeadEnrichmentFailed(
  leadId: number,
  detail: string,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        enrichment_status = 'FAILED',
        enrichment_detail = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [detail.slice(0, 500), leadId],
  });
}

/** Clear stuck PENDING after Phase 1 abort/timeout so UI is not left in a scraping state. */
export async function resetLeadEnrichmentIfStillPending(
  leadId: number,
  detail: string,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        enrichment_status = 'FAILED',
        enrichment_detail = ?,
        updated_at = datetime('now')
      WHERE id = ? AND enrichment_status = 'PENDING'
    `,
    args: [detail.slice(0, 500), leadId],
  });
}

export function enrichmentStatusFromRow(
  row: { enrichment_status?: string | null },
): EnrichmentStatus {
  const raw = row.enrichment_status?.trim().toUpperCase();
  if (
    raw === "EMAIL_FOUND" ||
    raw === "NO_EMAIL_FALLBACK" ||
    raw === "FAILED" ||
    raw === "PENDING"
  ) {
    return raw;
  }
  return "PENDING";
}
