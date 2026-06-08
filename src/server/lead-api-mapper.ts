import {
  buildInspectionSummary,
  daysSinceInspection,
} from "../engine/intelligence/compliance.js";
import {
  buildEhoReportUrl,
  formatRivalBadge,
  getConsultantTip,
  getLowestScoreArea,
  scoresFromRow,
  type FsaBreakdownScores,
} from "../engine/intelligence/carrot.js";
import { ensureLeadFsaScores } from "../engine/finder/fsa-detail.js";
import {
  countLocalPassReadyUsers,
  findLocalCompetitors,
} from "../engine/intelligence/competitors.js";
import { buildOutreachSequenceMeta } from "../engine/outreach-sequence-meta.js";
import { calculateRiskScore } from "../engine/risk-scorer.js";
import type { LeadRow } from "../engine/store/leads-repository.js";
import type { ApiContactDiscovery } from "../engine/store/contact-discovery-repository.js";

export interface LeadDataSignals {
  ehoScraped: boolean;
  predictiveScore: boolean;
  draftReady: boolean;
}

export interface ApiLeadDetail {
  id: number;
  fsaId: number;
  businessName: string;
  businessType: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  draftPreview: string | null;
  flagForReview: boolean;
  needsEyesReason: string | null;
  onDeliveryApp: string;
  leadScore: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  riskScore: number;
  riskBand: string;
  riskComponents: ReturnType<typeof calculateRiskScore>["components"];
  signals: LeadDataSignals;
  daysSinceInspection: number | null;
  inspectionSummary: string;
  competitors: Awaited<ReturnType<typeof findLocalCompetitors>>;
  localPassReadyCount: number;
  fsaScores: FsaBreakdownScores;
  consultantTip: string | null;
  rivalBadge: string | null;
  ehoReportUrl: string;
  carrotFocusArea: string | null;
  contactScore: number;
  contactable: boolean;
  contactDiscovery: ApiContactDiscovery | null;
  contactedAt: string | null;
  repliedAt: string | null;
  lastPreviewedAt: string | null;
  touchCount: number;
  sequenceTouch: number;
  sequenceMaxTouches: number;
  sequenceComplete: boolean;
  draftHasScoreLink: boolean;
  trackedScoreUrl: string;
  draftFull: string | null;
}

function readStatus(row: LeadRow & { status?: string }): string {
  return row.status ?? "new";
}

function readDraftMessage(row: LeadRow & { draft_message?: string | null }): string | null {
  return row.draft_message ?? null;
}

function deriveSignals(
  row: LeadRow & { status?: string; draft_message?: string | null },
  riskScore: number,
): LeadDataSignals {
  const status = readStatus(row);
  const hasEnrichment = Boolean(row.phone?.trim() || row.website?.trim());
  return {
    ehoScraped: hasEnrichment || row.lead_score > 0,
    predictiveScore: riskScore >= 25,
    draftReady: status === "drafted" || Boolean(readDraftMessage(row)),
  };
}

export async function mapLeadRowToApiLead(
  row: LeadRow,
  options?: {
    ensureFsaScores?: boolean;
    includeComparables?: boolean;
    contactScore?: number;
    contactable?: boolean;
    contactDiscovery?: ApiContactDiscovery | null;
  },
): Promise<ApiLeadDetail> {
  const includeComparables = options?.includeComparables !== false;
  let fsaScores = scoresFromRow(row);
  if (options?.ensureFsaScores) {
    fsaScores = await ensureLeadFsaScores(row.id, row.fsa_id, fsaScores);
  }
  const consultantTip = getConsultantTip(fsaScores);

  const risk = calculateRiskScore({
    fsaRating: row.fsa_rating,
    fsaLastInspectionDate: row.fsa_last_inspection_date,
    phone: row.phone,
    website: row.website,
  });

  const [competitors, localPassReadyCount] = includeComparables
    ? await Promise.all([
        findLocalCompetitors({
          id: row.id,
          postcode: row.postcode,
          business_type: row.business_type,
        }),
        countLocalPassReadyUsers(row.postcode),
      ])
    : [[], 0];

  const draftRaw = readDraftMessage(row);
  const draftPreview =
    typeof draftRaw === "string" && draftRaw.trim()
      ? draftRaw.trim().slice(0, 220)
      : null;
  const sequence = buildOutreachSequenceMeta({
    touch_count: row.touch_count,
    replied_at: row.replied_at,
    draft_message: draftRaw,
    fsa_id: row.fsa_id,
  });

  return {
    id: row.id,
    fsaId: row.fsa_id,
    businessName: row.business_name,
    businessType: row.business_type,
    address: row.address,
    postcode: row.postcode,
    latitude: row.latitude,
    longitude: row.longitude,
    fsaRating: row.fsa_rating,
    fsaLastInspectionDate: row.fsa_last_inspection_date,
    phone: row.phone,
    website: row.website,
    email: row.email ?? null,
    draftPreview,
    flagForReview: Boolean(row.flag_for_review),
    needsEyesReason: row.needs_eyes_reason ?? null,
    onDeliveryApp: row.on_delivery_app,
    leadScore: row.lead_score,
    status: readStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    riskScore: risk.score,
    riskBand: risk.band,
    riskComponents: risk.components,
    signals: deriveSignals(row, risk.score),
    daysSinceInspection: daysSinceInspection(row.fsa_last_inspection_date),
    inspectionSummary: buildInspectionSummary(
      row.fsa_rating,
      row.fsa_last_inspection_date,
    ),
    competitors,
    localPassReadyCount,
    fsaScores,
    consultantTip,
    rivalBadge: includeComparables ? formatRivalBadge(competitors) : null,
    ehoReportUrl: buildEhoReportUrl(row.fsa_id),
    carrotFocusArea: getLowestScoreArea(fsaScores),
    contactScore: options?.contactScore ?? 0,
    contactable: options?.contactable ?? false,
    contactDiscovery: options?.contactDiscovery ?? null,
    contactedAt: row.contacted_at ?? null,
    repliedAt: row.replied_at ?? null,
    lastPreviewedAt: row.last_previewed_at ?? null,
    touchCount: sequence.touchCount,
    sequenceTouch: sequence.sequenceTouch,
    sequenceMaxTouches: sequence.sequenceMaxTouches,
    sequenceComplete: sequence.sequenceComplete,
    draftHasScoreLink: sequence.draftHasScoreLink,
    trackedScoreUrl: sequence.trackedScoreUrl,
    draftFull: sequence.draftFull,
  };
}
