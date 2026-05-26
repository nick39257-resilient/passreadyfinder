import { productConfig } from "../config/product.config.js";
import {
  countLocalPassReadyUsers,
  findLocalCompetitors,
} from "./intelligence/competitors.js";
import {
  resolveConsultantTip,
  scoresFromRow,
} from "./intelligence/carrot.js";
import { calculateRiskScore } from "./risk-scorer.js";
import { ensureLeadFsaScores } from "./finder/fsa-detail.js";
import {
  createLlmClient,
  generateDraftForLead,
  saveDraftMessage,
  type LeadForDraft,
} from "./drafter.js";
import { getDb, runMigrations } from "./store/db.js";

/** Critical band — see operational_workflows.mdc */
const RISK_SCORE_THRESHOLD = 75;

/** 2-Star Rescue consultant tone for high-risk outreach */
const RESCUE_TEMPLATE_RATING = 2;

interface LeadForAutoDraft extends LeadForDraft {
  fsa_id: number;
  postcode: string;
  business_type: string;
  fsa_last_inspection_date: string | null;
  phone: string | null;
  website: string | null;
  fsa_score_hygiene?: number | null;
  fsa_score_structural?: number | null;
  fsa_score_management?: number | null;
}

export interface AutoDraftRunResult {
  drafted: number;
  skipped: number;
  errors: { leadId: number; businessName: string; error: string }[];
}

async function fetchEligibleNewLeads(): Promise<LeadForAutoDraft[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT
        id,
        fsa_id,
        business_name,
        address,
        postcode,
        business_type,
        fsa_rating,
        fsa_last_inspection_date,
        phone,
        website,
        fsa_score_hygiene,
        fsa_score_structural,
        fsa_score_management
      FROM leads
      WHERE status = 'new'
        AND contacted_at IS NULL
        AND draft_message IS NULL
        AND status != 'nurture'
        AND COALESCE(touch_count, 0) < ?
      ORDER BY lead_score DESC
    `,
    args: [productConfig.outreach.maxTouchesPerLead],
  });

  return result.rows as unknown as LeadForAutoDraft[];
}

function filterHighRiskLeads(
  leads: LeadForAutoDraft[],
  limit: number,
): { selected: LeadForAutoDraft[]; skipped: number } {
  const ranked = leads
    .map((lead) => ({
      lead,
      riskScore: calculateRiskScore({
        fsaRating: lead.fsa_rating,
        fsaLastInspectionDate: lead.fsa_last_inspection_date,
        phone: lead.phone,
        website: lead.website,
      }).score,
    }))
    .filter((entry) => entry.riskScore > RISK_SCORE_THRESHOLD)
    .sort((a, b) => b.riskScore - a.riskScore || a.lead.id - b.lead.id);

  return {
    selected: ranked.slice(0, limit).map((entry) => entry.lead),
    skipped: leads.length - Math.min(ranked.length, limit),
  };
}

/**
 * Background Prospector (Phase 6): draft high-risk new leads with the 2-Star Rescue template.
 * Saves to leads.draft_message and sets status = drafted (review queue).
 */
export async function runAutoDrafter(options?: {
  limit?: number;
}): Promise<AutoDraftRunResult> {
  await runMigrations();

  const limit = options?.limit ?? productConfig.outreach.draftBatchSize;
  const eligible = await fetchEligibleNewLeads();
  const { selected, skipped } = filterHighRiskLeads(eligible, limit);

  const result: AutoDraftRunResult = {
    drafted: 0,
    skipped,
    errors: [],
  };

  if (selected.length === 0) {
    return result;
  }

  console.log(
    `Auto-drafting ${selected.length} high-risk lead(s) (risk > ${RISK_SCORE_THRESHOLD}, 2-Star Rescue template)…\n`,
  );

  const llmClient = createLlmClient();

  for (let i = 0; i < selected.length; i++) {
    const lead = selected[i];
    try {
      const [competitors, localPassReadyCount] = await Promise.all([
        findLocalCompetitors({
          id: lead.id,
          postcode: lead.postcode,
          business_type: lead.business_type,
        }),
        countLocalPassReadyUsers(lead.postcode),
      ]);
      const fsaScores = await ensureLeadFsaScores(lead.id, lead.fsa_id, scoresFromRow(lead));
      const consultantTip = resolveConsultantTip(fsaScores);
      const draft = await generateDraftForLead(lead, llmClient, {
        templateRating: RESCUE_TEMPLATE_RATING,
        hookContext: { competitors, localPassReadyCount },
        consultantTip,
      });
      await saveDraftMessage(lead.id, draft);
      result.drafted++;
      console.log(`✓ ${lead.business_name}`);
      console.log(`  ${draft.split("\n").join("\n  ")}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      console.error(`✗ ${lead.business_name}: ${message}\n`);
    }
  }

  return result;
}
