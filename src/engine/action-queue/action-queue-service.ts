import { calculateRiskScore } from "../risk-scorer.js";
import { getLastSyncTimestamp } from "../sync/fsa-sync-state.js";
import {
  copilotDigestSize,
  copilotWhatsAppDailyCap,
  isCopilotOutreachMode,
} from "../outreach-strategy.js";
import { getContactDiscoverySummaries } from "../store/contact-discovery-repository.js";
import { getDb } from "../store/db.js";
import {
  getLeadById,
  type LeadRow,
} from "../store/leads-repository.js";
import { getScoreTrafficCounts } from "../store/score-traffic-repository.js";
import {
  scoreLeadForActionQueue,
  sortActionQueue,
  type ActionQueueItem,
} from "./action-queue-scorer.js";

export interface CopilotMetrics {
  scoreClicksTotal: number;
  scoreClicksUk: number;
  scoreClicksUs: number;
  whatsappSentToday: number;
  whatsappSentTotal: number;
  callsLoggedToday: number;
  callsLoggedTotal: number;
  repliesTotal: number;
  warmVisitors7d: number;
  whatsappDailyCap: number;
  copilotMode: boolean;
}

export interface ActionQueueDigest {
  generatedAt: string;
  digestSize: number;
  top: ActionQueueItem[];
  warm: ActionQueueItem[];
  triggers: ActionQueueItem[];
  whatsappQueue: ActionQueueItem[];
  callQueue: ActionQueueItem[];
  metrics: CopilotMetrics;
}

async function fetchCopilotCandidateLeads(): Promise<LeadRow[]> {
  const db = getDb();
  const result = await db.execute(`
    SELECT * FROM leads
    WHERE (
      (last_previewed_at IS NOT NULL AND datetime(last_previewed_at) >= datetime('now', '-7 days'))
      OR (
        fsa_rating IS NOT NULL AND fsa_rating <= 3
        AND (
          (phone IS NOT NULL AND TRIM(phone) != '')
          OR (email IS NOT NULL AND TRIM(email) != '')
        )
      )
      OR LOWER(COALESCE(status, 'new')) IN (
        'contacted', 'replied', 'ready_to_contact', 'drafted', 'ready_to_review'
      )
    )
    AND LOWER(COALESCE(status, 'new')) NOT IN ('suppressed')
    ORDER BY lead_score DESC
    LIMIT 800
  `);
  return result.rows as unknown as LeadRow[];
}

async function countWhatsappSentToday(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS c FROM leads
    WHERE whatsapp_sent_at IS NOT NULL
      AND date(whatsapp_sent_at) = date('now')
  `);
  return Number(result.rows[0]?.c ?? 0);
}

async function countWhatsappSentTotal(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS c FROM leads WHERE whatsapp_sent_at IS NOT NULL
  `);
  return Number(result.rows[0]?.c ?? 0);
}

async function countCallsLoggedToday(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS c FROM leads
    WHERE call_logged_at IS NOT NULL
      AND date(call_logged_at) = date('now')
  `);
  return Number(result.rows[0]?.c ?? 0);
}

async function countCallsLoggedTotal(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS c FROM leads WHERE call_logged_at IS NOT NULL
  `);
  return Number(result.rows[0]?.c ?? 0);
}

async function countRepliesTotal(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS c FROM leads WHERE replied_at IS NOT NULL
  `);
  return Number(result.rows[0]?.c ?? 0);
}

async function countWarmVisitors7d(): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    SELECT COUNT(*) AS c FROM leads
    WHERE last_previewed_at IS NOT NULL
      AND datetime(last_previewed_at) >= datetime('now', '-7 days')
  `);
  return Number(result.rows[0]?.c ?? 0);
}

export async function getCopilotMetrics(): Promise<CopilotMetrics> {
  const [traffic, waToday, waTotal, callToday, callTotal, replies, warm] =
    await Promise.all([
      getScoreTrafficCounts(),
      countWhatsappSentToday(),
      countWhatsappSentTotal(),
      countCallsLoggedToday(),
      countCallsLoggedTotal(),
      countRepliesTotal(),
      countWarmVisitors7d(),
    ]);

  return {
    scoreClicksTotal: traffic.total,
    scoreClicksUk: traffic.uk,
    scoreClicksUs: traffic.us,
    whatsappSentToday: waToday,
    whatsappSentTotal: waTotal,
    callsLoggedToday: callToday,
    callsLoggedTotal: callTotal,
    repliesTotal: replies,
    warmVisitors7d: warm,
    whatsappDailyCap: copilotWhatsAppDailyCap(),
    copilotMode: isCopilotOutreachMode(),
  };
}

export async function buildActionQueueDigest(): Promise<ActionQueueDigest> {
  const [rows, lastSyncAt, metrics, summaries] = await Promise.all([
    fetchCopilotCandidateLeads(),
    getLastSyncTimestamp(),
    getCopilotMetrics(),
    Promise.resolve(new Map<number, { whatsapp: string | null }>()),
  ]);

  let discoverySummaries = summaries;
  try {
    const full = await getContactDiscoverySummaries(rows.map((r) => r.id));
    discoverySummaries = new Map(
      [...full.entries()].map(([id, s]) => [id, { whatsapp: s.whatsapp }]),
    );
  } catch {
    // Discovery optional — phone-only WA links still work.
  }

  const items: ActionQueueItem[] = [];
  for (const row of rows) {
    const risk = calculateRiskScore({
      fsaRating: row.fsa_rating,
      fsaLastInspectionDate: row.fsa_last_inspection_date,
      phone: row.phone,
      website: row.website,
    });
    const summary = discoverySummaries.get(row.id);
    const scored = scoreLeadForActionQueue({
      row,
      lastSyncAt,
      whatsapp: summary?.whatsapp ?? null,
      riskScore: risk.score,
    });
    if (scored) {
      items.push(scored);
    }
  }

  const sorted = sortActionQueue(items);
  const digestSize = copilotDigestSize();
  const top = sorted.slice(0, digestSize);
  const warm = sorted.filter((i) => i.lane === "warm" || Boolean(i.lastPreviewedAt));
  const triggers = sorted.filter((i) => i.recentlyChanged && (i.fsaRating ?? 5) <= 3);
  const whatsappQueue = sorted.filter(
    (i) => i.whatsappUrl && !i.whatsappSentAt,
  );
  const callQueue = sorted.filter(
    (i) => i.phone && !i.callLoggedAt && i.lane === "call",
  );

  return {
    generatedAt: new Date().toISOString(),
    digestSize,
    top,
    warm: warm.slice(0, 25),
    triggers: triggers.slice(0, 25),
    whatsappQueue: whatsappQueue.slice(0, 25),
    callQueue: callQueue.slice(0, 25),
    metrics,
  };
}

export async function markLeadWhatsAppSent(leadId: number): Promise<void> {
  const db = getDb();
  const waToday = await countWhatsappSentToday();
  const cap = copilotWhatsAppDailyCap();
  if (waToday >= cap) {
    throw new Error(`WhatsApp daily cap reached (${cap}/day). Try again tomorrow.`);
  }

  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }

  await db.execute({
    sql: `
      UPDATE leads
      SET whatsapp_sent_at = datetime('now'),
          status = CASE
            WHEN LOWER(COALESCE(status, 'new')) = 'new' THEN 'contacted'
            ELSE status
          END,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [leadId],
  });
}

export async function markLeadCallLogged(leadId: number): Promise<void> {
  const db = getDb();
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }

  await db.execute({
    sql: `
      UPDATE leads
      SET call_logged_at = datetime('now'),
          status = CASE
            WHEN LOWER(COALESCE(status, 'new')) = 'new' THEN 'contacted'
            ELSE status
          END,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [leadId],
  });
}
