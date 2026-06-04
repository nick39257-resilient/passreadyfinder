import {
  TEXAS_CRITICAL_RISK_THRESHOLD,
  type TexasInterventionLevel,
} from "../../types/texas.js";

export interface TexasRiskInput {
  inspectionScore: number | null;
  demerits: number | null;
}

/**
 * Texas Risk Score (0–100). Higher = worse operational/regulatory exposure.
 * CRITICAL_INTERVENTION when score >= 79.
 */
export function computeTexasRiskScore(input: TexasRiskInput): number {
  let score = 0;

  if (input.demerits != null && Number.isFinite(input.demerits)) {
    score = Math.max(score, Math.min(100, Math.round(input.demerits * 4)));
  }

  if (input.inspectionScore != null && Number.isFinite(input.inspectionScore)) {
    const normalized = Math.max(0, Math.min(100, input.inspectionScore));
    const fromInspection = Math.round(100 - normalized);
    score = Math.max(score, fromInspection);
  }

  if (score === 0 && input.demerits == null && input.inspectionScore == null) {
    return 50;
  }

  return Math.min(100, Math.max(0, score));
}

export function interventionLevelForRiskScore(
  riskScore: number,
  threshold: number = TEXAS_CRITICAL_RISK_THRESHOLD,
): TexasInterventionLevel {
  return riskScore >= threshold ? "CRITICAL_INTERVENTION" : null;
}
