/** FSA breakdown scores (0–25 each; higher is better). */
export interface FsaBreakdownScores {
  hygiene: number | null;
  structural: number | null;
  management: number | null;
}

export type CarrotFocusArea = "hygiene" | "structural" | "management";

const TIPS: Record<CarrotFocusArea, string> = {
  hygiene:
    "Hygiene is your weakest area — focus on deep cleans, sanitiser logs, and cross-contamination controls before the next visit.",
  structural:
    "Structure is your weakest area — check fridge seals, grout, ceilings, and equipment maintenance; small fixes prevent major findings.",
  management:
    "Management is your weakest area — tighten digital record-keeping, daily checklists, and staff training so everything is inspection-ready.",
};

export function scoresFromRow(row: {
  fsa_score_hygiene?: number | null;
  fsa_score_structural?: number | null;
  fsa_score_management?: number | null;
}): FsaBreakdownScores {
  return {
    hygiene: row.fsa_score_hygiene ?? null,
    structural: row.fsa_score_structural ?? null,
    management: row.fsa_score_management ?? null,
  };
}

/** Lowest FSA sub-score (weakest area) drives the consultant tip. */
export function getLowestScoreArea(scores: FsaBreakdownScores): CarrotFocusArea | null {
  const candidates: { area: CarrotFocusArea; value: number }[] = [];
  if (scores.hygiene !== null) {
    candidates.push({ area: "hygiene", value: scores.hygiene });
  }
  if (scores.structural !== null) {
    candidates.push({ area: "structural", value: scores.structural });
  }
  if (scores.management !== null) {
    candidates.push({ area: "management", value: scores.management });
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => a.value - b.value);
  return candidates[0]?.area ?? null;
}

export function getConsultantTip(scores: FsaBreakdownScores): string | null {
  const area = getLowestScoreArea(scores);
  if (!area) {
    return null;
  }
  return TIPS[area];
}

export function buildEhoReportUrl(fsaId: number): string {
  return `https://ratings.food.gov.uk/business/${fsaId}`;
}

export function formatRivalBadge(
  competitors: { businessName: string; fsaRating: number | null }[],
): string | null {
  const rival = competitors[0];
  if (!rival) {
    return null;
  }
  const stars = rival.fsaRating === null ? "?" : String(rival.fsaRating);
  return `vs. ${rival.businessName}, ${stars}-Star`;
}
