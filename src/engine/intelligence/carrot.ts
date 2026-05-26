/** FSA breakdown scores (0–25 each; higher is better). */
export interface FsaBreakdownScores {
  hygiene: number | null;
  structural: number | null;
  management: number | null;
}

export type CarrotFocusArea = "hygiene" | "structural" | "management";

const TIPS: Record<CarrotFocusArea, string> = {
  hygiene:
    "A practical nudge for the middle of the message: staying on top of daily cleans and sanitizer logs when service is flat-out—no blame, just what helped you.",
  structural:
    "A practical nudge for the middle of the message: quick wins on seals, grout, and kit upkeep when you're running on fumes—peer tip, not a warning.",
  management:
    "A practical nudge for the middle of the message: keeping checklists and temps in one place so handovers are easier—share what your side project solved for you.",
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

/** Always returns a string suitable for the drafter (never null/undefined). */
export const DEFAULT_CONSULTANT_TIP =
  "A practical nudge for the middle of the message: when the rush hits, small habits on temps and handovers kept our line sane—peer to peer, not a lecture.";

export function resolveConsultantTip(scores: FsaBreakdownScores | null | undefined): string {
  if (!scores) {
    return DEFAULT_CONSULTANT_TIP;
  }
  return getConsultantTip(scores) ?? DEFAULT_CONSULTANT_TIP;
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
