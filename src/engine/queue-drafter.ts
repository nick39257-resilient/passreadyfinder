import OpenAI from "openai";
import { productConfig } from "../config/product.config.js";
import { ensureLeadFsaScores } from "./finder/fsa-detail.js";
import {
  countLocalPassReadyUsers,
  findLocalCompetitors,
} from "./intelligence/competitors.js";
import {
  resolveConsultantTip,
  scoresFromRow,
} from "./intelligence/carrot.js";
import { buildDraftVariables } from "./intelligence/draft-variables.js";
import {
  executeWithExponentialBackoff,
  isRateLimited,
  randomBetweenMs,
  sleep,
} from "./rate-limit-queue.js";
import { calculateRiskScore } from "./risk-scorer.js";
import {
  createLlmClient,
  extractCity,
  generateDraftForLead,
  saveDraftMessage,
  type LeadForDraft,
} from "./drafter.js";
import { getDb, runMigrations } from "./store/db.js";

/** 2-Star Rescue consultant tone for high-risk outreach */
const RESCUE_TEMPLATE_RATING = 2;

const queueConfig = productConfig.outreach.queueDrafter;

interface LeadForQueueDraft extends LeadForDraft {
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

export interface QueueDrafterRunResult {
  drafted: number;
  skipped: number;
  remainingNew: number;
  errors: { leadId: number; businessName: string; error: string }[];
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return String(err ?? "Unknown error");
}

/** Random pause between leads in one batch (anti-429). */
export async function throttleBetweenLeads(): Promise<void> {
  const waitMs = randomBetweenMs(
    queueConfig.leadDelayMinMs,
    queueConfig.leadDelayMaxMs,
  );
  console.log(
    `  Throttle: waiting ${Math.round(waitMs / 1000)}s before next lead (${queueConfig.leadDelayMinMs / 1000}–${queueConfig.leadDelayMaxMs / 1000}s)…`,
  );
  await sleep(waitMs);
}

async function countEligibleNewLeads(): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT COUNT(*) AS count
      FROM leads
      WHERE status = 'new'
        AND contacted_at IS NULL
        AND draft_message IS NULL
        AND COALESCE(touch_count, 0) < ?
    `,
    args: [productConfig.outreach.maxTouchesPerLead],
  });
  return Number(result.rows[0]?.count ?? 0);
}

async function fetchEligibleNewLeads(limit: number): Promise<LeadForQueueDraft[]> {
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
        AND COALESCE(touch_count, 0) < ?
      ORDER BY lead_score DESC
      LIMIT ?
    `,
    args: [productConfig.outreach.maxTouchesPerLead, limit * 4],
  });

  return result.rows as unknown as LeadForQueueDraft[];
}

function selectBatch(
  leads: LeadForQueueDraft[],
  batchSize: number,
): { selected: LeadForQueueDraft[]; skipped: number } {
  const threshold = queueConfig.riskScoreThreshold;

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
    .filter((entry) => entry.riskScore > threshold)
    .sort((a, b) => b.riskScore - a.riskScore || a.lead.id - b.lead.id);

  const selected = ranked.slice(0, batchSize).map((entry) => entry.lead);
  return {
    selected,
    skipped: Math.max(0, leads.length - selected.length),
  };
}

async function draftSingleLead(lead: LeadForQueueDraft, llmClient: OpenAI): Promise<string> {
  return executeWithExponentialBackoff(
    `QueueDrafter:${lead.business_name}`,
    async () => {
      const [competitors, localPassReadyCount] = await Promise.all([
        findLocalCompetitors({
          id: lead.id,
          postcode: lead.postcode,
          business_type: lead.business_type,
        }),
        countLocalPassReadyUsers(lead.postcode),
      ]);

      let fsaScores = scoresFromRow(lead);
      try {
        fsaScores = await ensureLeadFsaScores(lead.id, lead.fsa_id, fsaScores);
      } catch (err) {
        if (isRateLimited(err)) {
          throw err;
        }
      }

      const consultantTip = resolveConsultantTip(fsaScores);
      const city = extractCity(lead);
      const variables = buildDraftVariables({
        businessName: lead.business_name,
        city,
        consultantTip,
        competitors,
        scores: fsaScores,
      });

      return generateDraftForLead(lead, llmClient, {
        templateRating: RESCUE_TEMPLATE_RATING,
        hookContext: { competitors, localPassReadyCount },
        consultantTip,
        variables,
        includeLink: false,
        touchCount: 0,
      });
    },
    {
      basePauseMs: queueConfig.rateLimitPauseMs,
      maxRetries: queueConfig.maxRetriesPerLead,
    },
  );
}

async function processLeadWithRetry(
  lead: LeadForQueueDraft,
  llmClient: OpenAI,
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const draft = await draftSingleLead(lead, llmClient);
    await saveDraftMessage(lead.id, draft);
    return { ok: true, draft };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  }
}

/**
 * QueueDrafter — pick `new` leads, run ConsultantTip + Gemini, save as `drafted`.
 * One small batch per invocation; cron should run every ~30 minutes.
 */
export async function runQueueDrafter(options?: {
  batchSize?: number;
}): Promise<QueueDrafterRunResult> {
  await runMigrations();

  const batchSize = options?.batchSize ?? queueConfig.batchSize;
  const remainingNew = await countEligibleNewLeads();
  const pool = await fetchEligibleNewLeads(batchSize);
  const { selected, skipped } = selectBatch(pool, batchSize);

  const result: QueueDrafterRunResult = {
    drafted: 0,
    skipped,
    remainingNew,
    errors: [],
  };

  if (selected.length === 0) {
    console.log(
      `QueueDrafter: no eligible leads in this batch (risk > ${queueConfig.riskScoreThreshold}, status=new).`,
    );
    console.log(`  ${remainingNew} new lead(s) still in queue.\n`);
    return result;
  }

  console.log(
    `QueueDrafter: batch ${selected.length}/${batchSize} (risk > ${queueConfig.riskScoreThreshold})`,
  );
  console.log(
    `  ${remainingNew} new in queue · throttle ${queueConfig.leadDelayMinMs / 1000}–${queueConfig.leadDelayMaxMs / 1000}s between leads\n`,
  );

  const llmClient = createLlmClient();

  for (let i = 0; i < selected.length; i++) {
    if (i > 0) {
      await throttleBetweenLeads();
    }

    const lead = selected[i];
    console.log(`→ ${i + 1}/${selected.length}: ${lead.business_name}`);

    const outcome = await processLeadWithRetry(lead, llmClient);

    if (outcome.ok) {
      result.drafted++;
      console.log(`✓ drafted → ${lead.business_name}\n`);
    } else {
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: outcome.error,
      });
      console.error(`✗ ${lead.business_name}: ${outcome.error}\n`);
    }
  }

  return result;
}

/** @deprecated Use runQueueDrafter */
export const runAutoDrafter = runQueueDrafter;
