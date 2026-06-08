import { productConfig } from "../config/product.config.js";
import { buildTrackedLandingUrl, getOutreachLandingUrl } from "./outreach-landing-url.js";

export type SequenceTouch = 1 | 2 | 3 | 4;

export const MAX_OUTREACH_TOUCHES = productConfig.outreach.maxTouchesPerLead;

/** 1-based touch for the next email (maps from touch_count). */
export function nextSequenceTouch(touchCount: number, hasReplied = false): SequenceTouch {
  if (hasReplied) {
    return 2;
  }
  const next = Math.min(MAX_OUTREACH_TOUCHES, Math.max(1, touchCount + 1));
  return next as SequenceTouch;
}

const SCORE_HOSTS = ["score.passready.uk", "score.passready.us"] as const;

export function draftContainsScoreLink(draft: string | null | undefined): boolean {
  if (!draft?.trim()) {
    return false;
  }
  const lower = draft.toLowerCase();
  return SCORE_HOSTS.some((host) => lower.includes(host));
}

export interface OutreachSequenceMeta {
  touchCount: number;
  sequenceTouch: SequenceTouch;
  sequenceMaxTouches: number;
  sequenceComplete: boolean;
  draftHasScoreLink: boolean;
  trackedScoreUrl: string;
  draftFull: string | null;
}

export function buildOutreachSequenceMeta(row: {
  touch_count?: number | null;
  replied_at?: string | null;
  draft_message?: string | null;
  fsa_id: number;
}): OutreachSequenceMeta {
  const touchCount = row.touch_count ?? 0;
  const hasReplied = Boolean(row.replied_at?.trim());
  const sequenceTouch = nextSequenceTouch(touchCount, hasReplied);
  const draftRaw = row.draft_message?.trim() ?? null;
  const landingUrl = getOutreachLandingUrl();

  return {
    touchCount,
    sequenceTouch,
    sequenceMaxTouches: MAX_OUTREACH_TOUCHES,
    sequenceComplete: touchCount >= MAX_OUTREACH_TOUCHES,
    draftHasScoreLink: draftContainsScoreLink(draftRaw),
    trackedScoreUrl:
      row.fsa_id > 0 ? buildTrackedLandingUrl(landingUrl, row.fsa_id) : landingUrl,
    draftFull: draftRaw,
  };
}
