import type { ApiLead } from "../api/leads";
import type { RiskBand } from "../components/ActionCard";

export type PriorityTier = "high" | "medium" | "low";

export type LeadFilterKey =
  | "all"
  | "changed"
  | "needs_eyes"
  | "contactable"
  | "new"
  | "drafted"
  | "approved"
  | "sent"
  | "replies"
  | "call"
  | "whatsapp"
  | "high";

/** Same follow-up pool as Call — not replied / converted / suppressed. */
function isOutboundFollowUpCandidate(lead: ApiLead): boolean {
  if (
    lead.status === "suppressed" ||
    lead.status === "replied" ||
    lead.status === "opted_in" ||
    lead.status === "trial_started" ||
    lead.status === "nurture"
  ) {
    return false;
  }
  if (lead.repliedAt?.trim()) {
    return false;
  }
  return ["new", "drafted", "approved", "contacted"].includes(lead.status);
}

function hasCallablePhone(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

/** Phone follow-up — especially after email with no marked reply. */
export function isCallListLead(lead: ApiLead): boolean {
  return isOutboundFollowUpCandidate(lead) && hasCallablePhone(lead.phone);
}

/** WhatsApp follow-up when we have a wa.me link to the business. */
export function isWhatsAppListLead(lead: ApiLead): boolean {
  return isOutboundFollowUpCandidate(lead) && Boolean(lead.whatsappUrl?.trim());
}

/** True when you marked them as replied or they converted from a reply path. */
export function isReplyLead(lead: ApiLead): boolean {
  return (
    lead.status === "replied" ||
    lead.status === "trial_started" ||
    Boolean(lead.repliedAt?.trim())
  );
}

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
    case "changed":
      return (
        Boolean(lead.recentlyChanged) &&
        (lead.status === "new" || lead.status === "drafted")
      );
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
      return (
        lead.status === "contacted" ||
        lead.status === "replied" ||
        lead.status === "opted_in" ||
        lead.status === "trial_started"
      );
    case "replies":
      return isReplyLead(lead);
    case "call":
      return isCallListLead(lead);
    case "whatsapp":
      return isWhatsAppListLead(lead);
    case "high":
      return isHighPriorityLead(lead);
    default:
      return true;
  }
}

/**
 * Main list hides emailed leads unless you're on Sent / Replies / All —
 * otherwise contacted rows vanish after send (easy to think replies are missing).
 */
export function showLeadInRadarList(lead: ApiLead, filter: LeadFilterKey): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "sent" || filter === "replies" || filter === "call" || filter === "whatsapp") {
    return matchesLeadFilter(lead, filter);
  }
  if (
    lead.status === "contacted" ||
    lead.status === "nurture" ||
    lead.status === "opted_in" ||
    lead.status === "replied" ||
    lead.status === "trial_started"
  ) {
    return false;
  }
  return matchesLeadFilter(lead, filter);
}

export function emptyStateForFilter(filter: LeadFilterKey): string {
  switch (filter) {
    case "sent":
      return "No sent emails in this view — check Gmail for replies, then open each lead and tap Replied.";
    case "replies":
      return "No replies yet — Gmail replies auto-appear here when Resend inbound is configured; otherwise mark Replied on Sent.";
    case "call":
      return "No phone numbers for open leads — run Find + enrich, or check OSM on lead detail.";
    case "whatsapp":
      return "No WhatsApp numbers yet — phones come from Find/OSM; run Discover contacts on a lead for wa.me links from their site.";
    case "approved":
      return "Postbox is empty — approve a draft to queue for sending.";
    case "needs_eyes":
      return "No drafts waiting — run Draft or open a lead for Quick draft.";
    case "changed":
      return "No new FSA changes since last sync — run Check changes (UK).";
    default:
      return "Nothing matches this filter — try All or run Check changes (UK).";
  }
}

/** Short reason bullets inferred from existing API fields only. */
export function getLeadReasonBullets(lead: ApiLead, max = 2): string[] {
  const reasons: string[] = [];
  const c = lead.riskComponents;
  const scores = lead.fsaScores;
  const signals = lead.signals;
  const competitors = lead.competitors ?? [];

  if (c && (c.ratingPressure >= 24 || (lead.fsaRating !== null && lead.fsaRating <= 2))) {
    reasons.push("Rating pressure detected");
  }
  if (c && (c.inspectionStaleness >= 18 || (lead.daysSinceInspection !== null && lead.daysSinceInspection > 540))) {
    reasons.push("Inspection may be stale");
  }
  if (
    scores &&
    (lead.carrotFocusArea === "hygiene" || (scores.hygiene !== null && scores.hygiene < 12))
  ) {
    reasons.push("Low hygiene score opportunity");
  }
  if (lead.carrotFocusArea === "management") {
    reasons.push("Allergen readiness opportunity");
  }
  if (lead.carrotFocusArea === "structural") {
    reasons.push("Structural upkeep opportunity");
  }
  if (signals && lead.status === "new" && signals.ehoScraped) {
    reasons.push("New business opportunity");
  }
  if (signals && signals.draftReady && lead.status === "drafted") {
    reasons.push("Draft ready for review");
  }
  if (competitors.length > 0 && reasons.length < max) {
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
