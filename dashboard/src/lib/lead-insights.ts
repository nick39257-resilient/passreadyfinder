import type { ApiLead } from "../api/leads";
import type { RiskBand } from "../components/ActionCard";

export type PriorityTier = "high" | "medium" | "low";

export type LeadFilterKey =
  | "all"
  | "needs_eyes"
  | "contactable"
  | "new"
  | "drafted"
  | "approved"
  | "sent"
  | "high";

export function priorityFromBand(band: RiskBand): PriorityTier {
  if (band === "critical" || band === "high") {
    return "high";
  }
  if (band === "medium") {
    return "medium";
  }
  return "low";
}

export function priorityLabel(tier: PriorityTier): string {
  if (tier === "high") {
    return "High priority";
  }
  if (tier === "medium") {
    return "Medium priority";
  }
  return "Low priority";
}

export function riskBandDisplayLabel(band: RiskBand): string {
  if (band === "critical") {
    return "Critical";
  }
  return band.charAt(0).toUpperCase() + band.slice(1);
}

export function statusDisplayLabel(status: string): string {
  switch (status) {
    case "new":
      return "New";
    case "drafted":
      return "Draft";
    case "approved":
      return "In postbox";
    case "contacted":
    case "opted_in":
      return "Sent";
    case "nurture":
      return "Nurture";
    case "suppressed":
      return "Suppressed";
    case "replied":
      return "Replied — stopped";
    case "trial_started":
      return "Trial started";
    case "rejected":
      return "Rejected";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function isHighPriorityLead(lead: ApiLead): boolean {
  return lead.riskScore > 75 || lead.riskBand === "critical" || lead.riskBand === "high";
}

export function countHighPriorityLeads(leads: ApiLead[]): number {
  return leads.filter(isHighPriorityLead).length;
}

export function matchesLeadFilter(lead: ApiLead, filter: LeadFilterKey): boolean {
  switch (filter) {
    case "needs_eyes":
      return (
        lead.status === "drafted" &&
        (Boolean(lead.flagForReview) || Boolean(lead.needsEyesReason?.trim()))
      );
    case "contactable":
      return (
        lead.contactable ||
        Boolean(lead.email?.trim()) ||
        Boolean(lead.phone?.trim())
      );
    case "new":
      return lead.status === "new";
    case "drafted":
      return lead.status === "drafted";
    case "approved":
      return lead.status === "approved";
    case "sent":
      return lead.status === "contacted" || lead.status === "replied" || lead.status === "opted_in";
    case "high":
      return isHighPriorityLead(lead);
    default:
      return true;
  }
}

/** Short reason bullets inferred from existing API fields only. */
export function getLeadReasonBullets(lead: ApiLead, max = 2): string[] {
  const reasons: string[] = [];
  const { riskComponents: c } = lead;

  if (c.ratingPressure >= 24 || (lead.fsaRating !== null && lead.fsaRating <= 2)) {
    reasons.push("Rating pressure detected");
  }
  if (c.inspectionStaleness >= 18 || (lead.daysSinceInspection !== null && lead.daysSinceInspection > 540)) {
    reasons.push("Inspection may be stale");
  }
  if (lead.carrotFocusArea === "hygiene" || (lead.fsaScores.hygiene !== null && lead.fsaScores.hygiene < 12)) {
    reasons.push("Low hygiene score opportunity");
  }
  if (lead.carrotFocusArea === "management") {
    reasons.push("Allergen readiness opportunity");
  }
  if (lead.carrotFocusArea === "structural") {
    reasons.push("Structural upkeep opportunity");
  }
  if (lead.status === "new" && lead.signals.ehoScraped) {
    reasons.push("New business opportunity");
  }
  if (lead.signals.draftReady && lead.status === "drafted") {
    reasons.push("Draft ready for review");
  }
  if (lead.competitors.length > 0 && reasons.length < max) {
    reasons.push("Competitive local patch");
  }
  if (lead.inspectionSummary && reasons.length < max) {
    const short = lead.inspectionSummary.trim();
    if (short.length > 0 && short.length <= 48) {
      reasons.push(short);
    }
  }

  return [...new Set(reasons)].slice(0, max);
}

export const priorityCardStyles: Record<
  PriorityTier,
  { border: string; glow: string; badge: string; accent: string }
> = {
  high: {
    border: "border-rose-500/35",
    glow: "shadow-[0_0_24px_-8px_rgba(251,113,133,0.35)]",
    badge: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
    accent: "from-rose-500/10 to-transparent",
  },
  medium: {
    border: "border-amber-500/30",
    glow: "shadow-[0_0_20px_-10px_rgba(251,191,36,0.25)]",
    badge: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    accent: "from-amber-500/8 to-transparent",
  },
  low: {
    border: "border-slate-600/50",
    glow: "shadow-[0_0_16px_-12px_rgba(52,211,153,0.12)]",
    badge: "bg-slate-700/80 text-slate-300 ring-slate-600/40",
    accent: "from-emerald-500/5 to-transparent",
  },
};
