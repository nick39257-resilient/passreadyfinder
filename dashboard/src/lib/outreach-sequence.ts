import type { ApiLead } from "../api/leads";
import { isLiveVisitor } from "./live-visitor";

export function sequenceTouchLabel(lead: ApiLead): string {
  if (lead.sequenceComplete) {
    return "Sequence done";
  }
  return `Touch ${lead.sequenceTouch} of ${lead.sequenceMaxTouches}`;
}

export function sequenceProgressPercent(lead: ApiLead): number {
  if (lead.sequenceMaxTouches <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((lead.touchCount / lead.sequenceMaxTouches) * 100));
}

export function outreachFunnelStats(leads: ApiLead[]): {
  draftsWithScoreLink: number;
  liveVisitors: number;
  onFollowUpTouch: number;
  awaitingFirstSend: number;
  contactedNoScoreInDraft: number;
} {
  let draftsWithScoreLink = 0;
  let liveVisitors = 0;
  let onFollowUpTouch = 0;
  let awaitingFirstSend = 0;
  let contactedNoScoreInDraft = 0;

  for (const lead of leads) {
    if (lead.draftHasScoreLink) {
      draftsWithScoreLink++;
    }
    if (isLiveVisitor(lead.lastPreviewedAt)) {
      liveVisitors++;
    }
    if (lead.touchCount >= 1 && !lead.sequenceComplete) {
      onFollowUpTouch++;
    }
    if (lead.status === "approved" && lead.touchCount === 0) {
      awaitingFirstSend++;
    }
    if (
      (lead.status === "contacted" || lead.status === "drafted" || lead.status === "approved") &&
      lead.draftPreview &&
      !lead.draftHasScoreLink &&
      !lead.sequenceComplete
    ) {
      contactedNoScoreInDraft++;
    }
  }

  return {
    draftsWithScoreLink,
    liveVisitors,
    onFollowUpTouch,
    awaitingFirstSend,
    contactedNoScoreInDraft,
  };
}

export function highlightScoreUrl(text: string): { before: string; url: string; after: string } | null {
  const match = text.match(/(https?:\/\/score\.passready\.(?:uk|us)[^\s]*)/i);
  if (!match?.[1] || match.index === undefined) {
    return null;
  }
  return {
    before: text.slice(0, match.index),
    url: match[1],
    after: text.slice(match.index + match[1].length),
  };
}
