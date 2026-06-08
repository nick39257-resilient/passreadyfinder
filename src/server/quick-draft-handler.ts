import { assertDraftEnv } from "../engine/draft-env.js";
import {
  createLlmClient,
  extractCity,
  generateDraftForLead,
  routeDraftAfterSave,
  saveDraftMessage,
  type LeadForDraft,
} from "../engine/drafter.js";
import { tryEnrichLeadEmailFromWebsite } from "../engine/enrich/lead-email.js";
import { buildDraftVariables } from "../engine/intelligence/draft-variables.js";
import { ensureLeadFsaScores } from "../engine/finder/fsa-detail.js";
import {
  countLocalPassReadyUsers,
  findLocalCompetitors,
} from "../engine/intelligence/competitors.js";
import { resolveConsultantTip, scoresFromRow } from "../engine/intelligence/carrot.js";
import { isLeadOutreachHalted } from "../engine/outreach-halt.js";
import { getLeadById } from "../engine/store/leads-repository.js";
import { markLeadReplied } from "../engine/store/sender-repository.js";
import { runMigrations } from "../engine/store/db.js";

export function formatRouteError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }
  if (err === undefined || err === null) {
    return "Unknown error";
  }
  return String(err);
}

export interface QuickDraftResult {
  draft: string;
  lane: "postbox" | "needs_eyes";
  reason?: string;
  emailDiscovered?: string | null;
}

export async function quickDraftLeadById(leadId: number): Promise<QuickDraftResult> {
  await runMigrations();
  assertDraftEnv();

  let row = await getLeadById(leadId);
  if (!row) {
    throw new Error("Lead not found");
  }
  if (isLeadOutreachHalted(row)) {
    throw new Error("Outreach is halted for this business (suppressed, replied, or converted)");
  }
  const hasReplied = Boolean((row as { replied_at?: string | null }).replied_at);
  if (row.contacted_at && !hasReplied) {
    throw new Error(
      "Lead already contacted — mark as replied before generating a follow-up draft",
    );
  }

  let emailDiscovered: string | null = null;
  if (!row.email?.trim() && row.website?.trim()) {
    emailDiscovered = await tryEnrichLeadEmailFromWebsite(leadId, row.website);
    if (emailDiscovered) {
      row = (await getLeadById(leadId)) ?? row;
    }
  }

  const [competitors, localPassReadyCount] = await Promise.all([
    findLocalCompetitors({
      id: row.id,
      postcode: row.postcode,
      business_type: row.business_type,
    }),
    countLocalPassReadyUsers(row.postcode),
  ]);

  let fsaScores = scoresFromRow(row);
  try {
    fsaScores = await ensureLeadFsaScores(row.id, row.fsa_id, fsaScores);
  } catch {
    /* FSA score fetch is optional — draft still proceeds */
  }

  const consultantTip = resolveConsultantTip(fsaScores);
  const leadForDraft: LeadForDraft = {
    id: row.id,
    fsa_id: row.fsa_id,
    business_name: row.business_name,
    address: row.address,
    postcode: row.postcode,
    fsa_rating: row.fsa_rating,
    fsa_last_inspection_date: row.fsa_last_inspection_date ?? null,
    local_authority_name: row.local_authority_name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    flag_for_review: row.flag_for_review ?? 0,
  };
  const city = extractCity(leadForDraft);
  const variables = buildDraftVariables({
    businessName: row.business_name,
    city,
    consultantTip,
    competitors,
    scores: fsaScores,
  });

  const llm = createLlmClient();
  const draft = await generateDraftForLead(
    leadForDraft,
    llm,
    {
      hookContext: { competitors, localPassReadyCount },
      consultantTip,
      variables,
      hasReplied,
      touchCount: row.touch_count ?? 0,
    },
  );

  await saveDraftMessage(leadId, draft);
  const routed = await routeDraftAfterSave({ lead: leadForDraft, draft });

  return {
    draft,
    lane: routed.lane,
    reason: routed.lane === "needs_eyes" ? routed.reason : undefined,
    emailDiscovered,
  };
}

/** Mark a reply and regenerate a follow-up draft that may include the WhatsApp link. */
export async function markLeadRepliedAndDraftFollowUp(leadId: number): Promise<QuickDraftResult> {
  await runMigrations();
  assertDraftEnv();

  const row = await getLeadById(leadId);
  if (!row) {
    throw new Error("Lead not found");
  }

  await markLeadReplied(leadId);

  return quickDraftLeadById(leadId);
}
