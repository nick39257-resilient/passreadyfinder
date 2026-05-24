import { productConfig } from "../../config/product.config.js";
import type { DeliveryAppStatus } from "../../types/lead.js";

export interface ScoreInput {
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  onDeliveryApp?: DeliveryAppStatus;
}

/**
 * lead_score formula (transparent, weighted):
 *
 *   ratingPoints       — lower FSA rating = hotter (0→50, 1→40, 2→30, …)
 * + inspectionPoints   — older inspection = hotter (daysSince / 30, capped at 36)
 * + deliveryBonus      — +5 if on_delivery_app = 'true'; 'unknown' and 'false' add nothing
 *
 * Score on FREE FSA data first; OSM enrichment only updates deliveryBonus (rare) and contact fields.
 */
export function calculateLeadScore(input: ScoreInput): number {
  const { scoring } = productConfig;
  let score = 0;

  if (input.fsaRating === null) {
    score += scoring.nullRatingPoints;
  } else {
    const idx = Math.min(Math.max(input.fsaRating, 0), 5);
    score += scoring.ratingPoints[idx];
  }

  if (input.fsaLastInspectionDate) {
    const inspectionDate = new Date(input.fsaLastInspectionDate);
    const daysSince = Math.floor(
      (Date.now() - inspectionDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSince > 0) {
      const inspectionPoints = Math.min(
        Math.floor(daysSince / scoring.inspectionAgeDivisor),
        scoring.inspectionAgeMaxPoints,
      );
      score += inspectionPoints;
    }
  }

  if (input.onDeliveryApp === "true") {
    score += scoring.deliveryAppBonus;
  }

  return score;
}
