import type { OsmAreaBusiness } from "./overpass-area-search.js";

export interface ScoredOpenLead {
  business: OsmAreaBusiness;
  priorityScore: number;
  gapReasons: string[];
}

export function scoreOpenSearchLead(business: OsmAreaBusiness): ScoredOpenLead {
  const gaps: string[] = [];
  let score = 20;

  if (!business.website) {
    gaps.push("No active website");
    score += 35;
  }
  if (!business.phone) {
    gaps.push("No phone on record");
    score += 25;
  }
  if (!business.email) {
    gaps.push("No email found");
    score += 15;
  }
  if (!business.address) {
    gaps.push("Incomplete address");
    score += 10;
  }

  return {
    business,
    priorityScore: Math.min(score, 100),
    gapReasons: gaps,
  };
}
