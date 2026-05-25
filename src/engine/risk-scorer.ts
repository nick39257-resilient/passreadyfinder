/**
 * Weighted compliance risk score — see .cursor/rules/operational_workflows.mdc
 */

export type RiskBand = "critical" | "high" | "medium" | "low";

export interface RiskScoreInput {
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  phone?: string | null;
  website?: string | null;
}

export interface RiskScoreResult {
  score: number;
  band: RiskBand;
  components: {
    ratingPressure: number;
    inspectionStaleness: number;
    lowRatingUrgency: number;
    contactGap: number;
  };
}

const STALENESS_CAP_DAYS = 730;

function clampRating(rating: number): number {
  return Math.min(Math.max(rating, 0), 5);
}

function ratingPressurePoints(fsaRating: number | null): number {
  if (fsaRating === null) {
    return 20;
  }
  return ((5 - clampRating(fsaRating)) / 5) * 40;
}

function inspectionStalenessPoints(fsaLastInspectionDate: string | null): number {
  if (!fsaLastInspectionDate) {
    return 0;
  }
  const inspectionDate = new Date(fsaLastInspectionDate);
  if (Number.isNaN(inspectionDate.getTime())) {
    return 0;
  }
  const daysSince = Math.floor(
    (Date.now() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSince <= 0) {
    return 0;
  }
  return Math.min(daysSince / STALENESS_CAP_DAYS, 1) * 35;
}

function lowRatingUrgencyPoints(fsaRating: number | null): number {
  if (fsaRating === null) {
    return 5;
  }
  if (fsaRating <= 1) {
    return 15;
  }
  if (fsaRating === 2) {
    return 10;
  }
  if (fsaRating === 3) {
    return 5;
  }
  return 0;
}

function contactGapPoints(phone?: string | null, website?: string | null): number {
  const hasPhone = Boolean(phone?.trim());
  const hasWebsite = Boolean(website?.trim());
  if (!hasPhone && !hasWebsite) {
    return 10;
  }
  if (!hasPhone || !hasWebsite) {
    return 5;
  }
  return 0;
}

export function getRiskBand(score: number): RiskBand {
  if (score >= 75) {
    return "critical";
  }
  if (score >= 50) {
    return "high";
  }
  if (score >= 25) {
    return "medium";
  }
  return "low";
}

/** Weighted 0–100 compliance risk score. Higher = more urgent. */
export function calculateRiskScore(input: RiskScoreInput): RiskScoreResult {
  const components = {
    ratingPressure: ratingPressurePoints(input.fsaRating),
    inspectionStaleness: inspectionStalenessPoints(input.fsaLastInspectionDate),
    lowRatingUrgency: lowRatingUrgencyPoints(input.fsaRating),
    contactGap: contactGapPoints(input.phone, input.website),
  };

  const raw =
    components.ratingPressure +
    components.inspectionStaleness +
    components.lowRatingUrgency +
    components.contactGap;

  const score = Math.min(100, Math.max(0, Math.round(raw)));

  return {
    score,
    band: getRiskBand(score),
    components,
  };
}
