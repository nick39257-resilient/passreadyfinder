import { assertDraftEnv } from "../engine/draft-env.js";
import {
  createLlmClient,
  generateDraftForLead,
  saveDraftMessage,
} from "../engine/drafter.js";
import { ensureLeadFsaScores } from "../engine/finder/fsa-detail.js";
import {
  countLocalPassReadyUsers,
  findLocalCompetitors,
} from "../engine/intelligence/competitors.js";
import { resolveConsultantTip, scoresFromRow } from "../engine/intelligence/carrot.js";
import { getLeadById } from "../engine/store/leads-repository.js";
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

export async function quickDraftLeadById(leadId: number): Promise<string> {
  await runMigrations();
  assertDraftEnv();

  const row = await getLeadById(leadId);
  if (!row) {
    throw new Error("Lead not found");
  }
  if (row.contacted_at) {
    throw new Error("Lead already contacted — outreach blocked");
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

  const llm = createLlmClient();
  const draft = await generateDraftForLead(
    {
      id: row.id,
      business_name: row.business_name,
      address: row.address,
      postcode: row.postcode,
      fsa_rating: row.fsa_rating,
    },
    llm,
    {
      templateRating: row.fsa_rating === 2 ? 2 : row.fsa_rating,
      hookContext: { competitors, localPassReadyCount },
      consultantTip,
    },
  );

  await saveDraftMessage(leadId, draft);
  return draft;
}
