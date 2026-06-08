import type { ApiTexasLead } from "../api/texas-leads";
import type { ScoreTrafficStats } from "../api/score-traffic";
import { isLiveVisitor } from "./live-visitor";

export function texasOutreachFunnelStats(
  leads: ApiTexasLead[],
  scoreTraffic: ScoreTrafficStats | null,
): {
  draftsWithScoreLink: number;
  liveVisitors: number;
  usScoreHits: number | null;
  outreachSent: number;
  needsScoreLinkRefresh: number;
  readyNotSent: number;
} {
  let draftsWithScoreLink = 0;
  let liveVisitors = 0;
  let outreachSent = 0;
  let needsScoreLinkRefresh = 0;
  let readyNotSent = 0;

  for (const lead of leads) {
    if (lead.draftHasScoreLink) {
      draftsWithScoreLink++;
    }
    if (isLiveVisitor(lead.lastPreviewedAt)) {
      liveVisitors++;
    }
    if (lead.outreachComplete) {
      outreachSent++;
    }
    if (lead.needsScoreLinkRefresh) {
      needsScoreLinkRefresh++;
    }
    if (!lead.outreachComplete && lead.outreachChannel !== "unavailable") {
      readyNotSent++;
    }
  }

  return {
    draftsWithScoreLink,
    liveVisitors,
    usScoreHits: scoreTraffic?.us ?? null,
    outreachSent,
    needsScoreLinkRefresh,
    readyNotSent,
  };
}
