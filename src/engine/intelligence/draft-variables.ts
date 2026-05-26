import type { LocalCompetitor } from "./competitors.js";
import type { FsaBreakdownScores } from "./carrot.js";
import { getLowestScoreArea } from "./carrot.js";

export interface DraftVariables {
  businessName: string;
  /** Practical FSA-area note — never framed as a rating or failure. */
  fsaIssue: string;
  /** Neighbourhood / high-street anchor for personalization. */
  localReference: string;
}

const FSA_AREA_LABELS = {
  hygiene: "day-to-day hygiene habits when service is flat-out",
  structural: "small structural upkeep wins between services",
  management: "keeping checklists and handovers organised under pressure",
} as const;

export function buildFsaIssuePhrase(
  consultantTip: string,
  scores?: FsaBreakdownScores | null,
): string {
  const area = scores ? getLowestScoreArea(scores) : null;
  if (area) {
    return FSA_AREA_LABELS[area];
  }
  const trimmed = consultantTip.trim();
  if (trimmed.length > 0) {
    return trimmed.replace(/^A practical nudge[^:]*:\s*/i, "").slice(0, 120);
  }
  return "keeping on top of temps and handovers when the rush hits";
}

export function buildLocalReference(city: string, competitors: LocalCompetitor[]): string {
  const place = city.trim() || "your high street";
  const rival = competitors[0];
  if (rival?.businessName) {
    return `${place} — same patch as ${rival.businessName}`;
  }
  return `${place} takeaway scene`;
}

export function buildDraftVariables(input: {
  businessName: string;
  city: string;
  consultantTip: string;
  competitors: LocalCompetitor[];
  scores?: FsaBreakdownScores | null;
}): DraftVariables {
  return {
    businessName: input.businessName.trim(),
    fsaIssue: buildFsaIssuePhrase(input.consultantTip, input.scores),
    localReference: buildLocalReference(input.city, input.competitors),
  };
}

/** Ensure Gemini wove in all three dynamic variables (case-insensitive). */
export function assertDraftUsesVariables(draft: string, variables: DraftVariables): void {
  const body = draft.toLowerCase();
  const name = variables.businessName.toLowerCase();
  if (name.length >= 3 && !body.includes(name)) {
    throw new Error(`Draft must mention the business name (${variables.businessName})`);
  }

  const fsaTokens = variables.fsaIssue.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const fsaHits = fsaTokens.filter((t) => body.includes(t)).length;
  if (fsaHits < Math.min(2, fsaTokens.length)) {
    throw new Error("Draft must include the FSA practical issue hook");
  }

  const localTokens = variables.localReference.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const localHits = localTokens.filter((t) => body.includes(t)).length;
  if (localHits < Math.min(2, localTokens.length)) {
    throw new Error("Draft must include the local reference");
  }
}
