import type { NeedsEyesReason } from "../../validation/triage.schemas.js";
import {
  leadTriageMutationSchema,
  type LeadTriageMutation,
} from "../../validation/triage.schemas.js";
import { isLeadOutreachHalted } from "../outreach-halt.js";
import { getDb } from "./db.js";
import type { LeadRow } from "./leads-repository.js";

export const STALLED_STATUS_HOURS = 48;
export const STUCK_ENRICHMENT_MINUTES = 15;

export interface StuckLeadRow {
  id: number;
  business_name: string;
  status: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  contact_method: string | null;
  enrichment_status: string | null;
  updated_at: string;
}

function parseSqliteUtc(iso: string): number {
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

/** Atomically flag a lead for operator review with a machine-readable reason. */
export async function flagLeadForTriage(
  leadId: number,
  reason: NeedsEyesReason,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads
      SET flag_for_review = 1,
          needs_eyes_reason = ?,
          needs_eyes_updated_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [reason, leadId],
  });
}

/** Apply a validated triage mutation — all state changes go through this boundary. */
export async function applyLeadTriageMutation(raw: LeadTriageMutation): Promise<boolean> {
  const mutation = leadTriageMutationSchema.parse(raw);
  const db = getDb();

  switch (mutation.action) {
    case "flag_for_review": {
      const result = await db.execute({
        sql: `
          UPDATE leads
          SET flag_for_review = 1,
              needs_eyes_reason = ?,
              needs_eyes_updated_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
        args: [mutation.reason, mutation.leadId],
      });
      return (result.rowsAffected ?? 0) > 0;
    }
    case "clear_pending_enrichment": {
      const result = await db.execute({
        sql: `
          UPDATE leads
          SET enrichment_status = 'FAILED',
              enrichment_detail = ?,
              flag_for_review = 1,
              needs_eyes_reason = ?,
              needs_eyes_updated_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ? AND enrichment_status = 'PENDING'
        `,
        args: [
          mutation.enrichmentDetail ?? mutation.reason,
          mutation.reason,
          mutation.leadId,
        ],
      });
      return (result.rowsAffected ?? 0) > 0;
    }
    case "route_whatsapp": {
      const result = await db.execute({
        sql: `
          UPDATE leads
          SET contact_method = 'WHATSAPP',
              flag_for_review = 1,
              needs_eyes_reason = ?,
              needs_eyes_updated_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `,
        args: [mutation.reason, mutation.leadId],
      });
      return (result.rowsAffected ?? 0) > 0;
    }
    case "move_to_nurture": {
      const result = await db.execute({
        sql: `
          UPDATE leads
          SET status = 'nurture',
              flag_for_review = 0,
              needs_eyes_reason = ?,
              needs_eyes_updated_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
            AND status NOT IN ('suppressed', 'replied', 'opted_in', 'trial_started')
        `,
        args: [mutation.reason, mutation.leadId],
      });
      return (result.rowsAffected ?? 0) > 0;
    }
    default: {
      const _exhaustive: never = mutation.action;
      throw new Error(`Unknown triage action: ${_exhaustive}`);
    }
  }
}

/** drafted / approved unchanged longer than STALLED_STATUS_HOURS. */
export async function findStalledPipelineLeads(): Promise<StuckLeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, business_name, status, email, phone, website, contact_method, enrichment_status, updated_at
      FROM leads
      WHERE status IN ('drafted', 'approved')
        AND updated_at < datetime('now', ?)
    `,
    args: [`-${STALLED_STATUS_HOURS} hours`],
  });
  return result.rows as unknown as StuckLeadRow[];
}

/** ready_to_review without email, or approved in postbox (caller validates email). */
export async function findStuckPostboxLeads(): Promise<StuckLeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, business_name, status, email, phone, website, contact_method, enrichment_status, updated_at
      FROM leads
      WHERE status IN ('ready_to_review', 'approved')
        AND (
          email IS NULL
          OR TRIM(email) = ''
        )
    `,
  });
  return result.rows as unknown as StuckLeadRow[];
}

/** Approved postbox rows — email validity checked in triage layer. */
export async function findApprovedPostboxLeads(): Promise<StuckLeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, business_name, status, email, phone, website, contact_method, enrichment_status, updated_at
      FROM leads
      WHERE status IN ('approved', 'ready_to_contact')
        AND draft_message IS NOT NULL
    `,
  });
  return result.rows as unknown as StuckLeadRow[];
}

/** enrichment_status PENDING longer than STUCK_ENRICHMENT_MINUTES. */
export async function findStuckPendingEnrichmentLeads(): Promise<StuckLeadRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT id, business_name, status, email, phone, website, contact_method, enrichment_status, updated_at
      FROM leads
      WHERE enrichment_status = 'PENDING'
        AND updated_at < datetime('now', ?)
    `,
    args: [`-${STUCK_ENRICHMENT_MINUTES} minutes`],
  });
  return result.rows as unknown as StuckLeadRow[];
}

/** Batch-clear all PENDING enrichment rows older than threshold. */
export async function clearAllStuckPendingEnrichment(
  reason: NeedsEyesReason,
  detail: string,
): Promise<number> {
  const db = getDb();
  const before = await findStuckPendingEnrichmentLeads();
  if (before.length === 0) {
    return 0;
  }

  const result = await db.execute({
    sql: `
      UPDATE leads
      SET enrichment_status = 'FAILED',
          enrichment_detail = ?,
          flag_for_review = 1,
          needs_eyes_reason = ?,
          needs_eyes_updated_at = datetime('now'),
          updated_at = datetime('now')
      WHERE enrichment_status = 'PENDING'
        AND updated_at < datetime('now', ?)
    `,
    args: [detail.slice(0, 500), reason, `-${STUCK_ENRICHMENT_MINUTES} minutes`],
  });
  return result.rowsAffected ?? before.length;
}

export function leadHasValidPhone(row: Pick<LeadRow, "phone">): boolean {
  return Boolean(row.phone?.trim());
}

export function shouldExitActivePipeline(row: Pick<LeadRow, "status">): boolean {
  return isLeadOutreachHalted(row);
}

export function isStalledByAge(updatedAt: string, thresholdHours: number): boolean {
  const ageMs = Date.now() - parseSqliteUtc(updatedAt);
  return ageMs > thresholdHours * 60 * 60 * 1000;
}
