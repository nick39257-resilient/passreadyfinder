import { isValidOutreachEmail } from "./outreach-email.js";
import { buildOutboundWaMeLink } from "./whatsapp-link.js";
import {
  applyLeadTriageMutation,
  clearAllStuckPendingEnrichment,
  findApprovedPostboxLeads,
  findStalledPipelineLeads,
  findStuckPendingEnrichmentLeads,
  findStuckPostboxLeads,
  leadHasValidPhone,
  shouldExitActivePipeline,
  type StuckLeadRow,
} from "./store/lead-triage-repository.js";
import { runMigrations } from "./store/db.js";
import {
  leadTriageResultSchema,
  type LeadTriageResult,
  type NeedsEyesReason,
} from "../validation/triage.schemas.js";

function emptyResult(): LeadTriageResult {
  return {
    scanned: 0,
    flagged: 0,
    clearedPending: 0,
    routedWhatsapp: 0,
    movedToNurture: 0,
    actions: [],
  };
}

function recordAction(
  result: LeadTriageResult,
  leadId: number,
  action: LeadTriageResult["actions"][number]["action"],
  reason: NeedsEyesReason,
): void {
  result.actions.push({ leadId, action, reason });
}

/**
 * Degrade email pipeline to WhatsApp when a UK mobile is available,
 * otherwise remove the lead from active loops via nurture.
 */
export async function processStuckLeadFallback(
  row: StuckLeadRow,
  reason: NeedsEyesReason,
  result: LeadTriageResult,
): Promise<void> {
  if (shouldExitActivePipeline(row)) {
    return;
  }

  const waLink = buildOutboundWaMeLink({
    businessName: row.business_name,
    phone: row.phone,
  });

  if (leadHasValidPhone(row) && waLink) {
    const ok = await applyLeadTriageMutation({
      leadId: row.id,
      action: "route_whatsapp",
      reason: "WHATSAPP_FALLBACK_ROUTED",
      contactMethod: "WHATSAPP",
    });
    if (ok) {
      result.routedWhatsapp++;
      result.flagged++;
      recordAction(result, row.id, "route_whatsapp", "WHATSAPP_FALLBACK_ROUTED");
    }
    return;
  }

  const ok = await applyLeadTriageMutation({
    leadId: row.id,
    action: "move_to_nurture",
    reason: "NO_CONTACT_ROUTE_NURTURE",
    status: "nurture",
  });
  if (ok) {
    result.movedToNurture++;
    recordAction(result, row.id, "move_to_nurture", "NO_CONTACT_ROUTE_NURTURE");
  }
}

async function triageStalledStatuses(result: LeadTriageResult): Promise<void> {
  const stalled = await findStalledPipelineLeads();
  result.scanned += stalled.length;

  for (const row of stalled) {
    if (shouldExitActivePipeline(row)) {
      continue;
    }

    const reason: NeedsEyesReason =
      row.status === "approved" ? "STALLED_APPROVED_48H" : "STALLED_DRAFT_48H";

    const ok = await applyLeadTriageMutation({
      leadId: row.id,
      action: "flag_for_review",
      reason,
    });
    if (ok) {
      result.flagged++;
      recordAction(result, row.id, "flag_for_review", reason);
    }
  }
}

async function triageStuckPostbox(result: LeadTriageResult): Promise<void> {
  const noEmail = await findStuckPostboxLeads();
  const approvedPool = await findApprovedPostboxLeads();
  const invalidApproved = approvedPool.filter((row) => !isValidOutreachEmail(row.email));

  const seen = new Set<number>();
  const stuck: StuckLeadRow[] = [];
  for (const row of [...noEmail, ...invalidApproved]) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    stuck.push(row);
  }

  result.scanned += stuck.length;

  for (const row of stuck) {
    if (shouldExitActivePipeline(row)) {
      continue;
    }

    const reason: NeedsEyesReason =
      row.status === "ready_to_review"
        ? "READY_TO_REVIEW_NO_EMAIL"
        : "STUCK_IN_POSTBOX_NO_EMAIL";

    await processStuckLeadFallback(row, reason, result);
  }
}

async function triageStuckEnrichment(result: LeadTriageResult): Promise<void> {
  const pending = await findStuckPendingEnrichmentLeads();
  result.scanned += pending.length;

  const cleared = await clearAllStuckPendingEnrichment(
    "ENRICHMENT_PENDING_TIMEOUT",
    "triage:enrichment_pending_timeout",
  );
  result.clearedPending += cleared;
  result.flagged += cleared;

  for (const row of pending) {
    recordAction(result, row.id, "clear_pending_enrichment", "ENRICHMENT_PENDING_TIMEOUT");

    if (!isValidOutreachEmail(row.email) && !leadHasValidPhone(row)) {
      await processStuckLeadFallback(row, "NO_CONTACT_ROUTE_NURTURE", result);
    }
  }
}

/**
 * Automated triage and recovery for stalled UK outreach leads.
 * Safe to call from pipeline finally, status polls, and send cron.
 */
export async function runLeadTriage(): Promise<LeadTriageResult> {
  await runMigrations();

  const result = emptyResult();

  try {
    await triageStuckEnrichment(result);
    await triageStalledStatuses(result);
    await triageStuckPostbox(result);
  } catch (err) {
    console.error(
      "Lead triage failed:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  return leadTriageResultSchema.parse(result);
}

/** Pipeline fallback hook — runs triage without throwing into the find job. */
export async function runPipelineLeadRecovery(): Promise<LeadTriageResult | null> {
  try {
    const result = await runLeadTriage();
    if (result.flagged + result.clearedPending + result.routedWhatsapp + result.movedToNurture > 0) {
      console.log(
        `Lead triage: flagged=${result.flagged} clearedPending=${result.clearedPending} whatsapp=${result.routedWhatsapp} nurture=${result.movedToNurture}`,
      );
    }
    return result;
  } catch (err) {
    console.warn(
      "Pipeline lead recovery skipped:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
