import { leadChangedSinceSync } from "../sync/sync-label.js";
import { buildOutboundWaMeLink } from "../whatsapp-link.js";
import { copilotWhatsAppOpener } from "../outreach-strategy.js";
import type { LeadRow } from "../store/leads-repository.js";

export type ActionLane = "warm" | "trigger" | "whatsapp" | "call";

export interface ActionQueueItem {
  leadId: number;
  businessName: string;
  postcode: string;
  fsaRating: number | null;
  riskScore: number;
  leadScore: number;
  lane: ActionLane;
  priorityScore: number;
  reasons: string[];
  phone: string | null;
  whatsappUrl: string | null;
  whatsappMessage: string | null;
  email: string | null;
  lastPreviewedAt: string | null;
  recentlyChanged: boolean;
  status: string;
  whatsappSentAt: string | null;
  callLoggedAt: string | null;
}

function daysSince(isoDate: string | null | undefined): number | null {
  if (!isoDate?.trim()) {
    return null;
  }
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) {
    return null;
  }
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

function isWarmVisitor(row: LeadRow): boolean {
  const days = daysSince(row.last_previewed_at);
  return days !== null && days <= 7;
}

function isTriggerLead(row: LeadRow, lastSyncAt: string | null): boolean {
  const rating = row.fsa_rating;
  const lowRating = rating !== null && rating <= 3;
  if (!lowRating) {
    return false;
  }
  if (leadChangedSinceSync(row.updated_at, lastSyncAt)) {
    return true;
  }
  const inspDays = daysSince(row.fsa_last_inspection_date);
  return inspDays !== null && inspDays <= 30;
}

function hasCallablePhone(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length >= 10;
}

function isActionableStatus(status: string | undefined): boolean {
  const s = (status ?? "new").toLowerCase();
  if (["suppressed", "replied", "opted_in", "trial_started", "nurture"].includes(s)) {
    return false;
  }
  return true;
}

export function scoreLeadForActionQueue(input: {
  row: LeadRow;
  lastSyncAt: string | null;
  whatsapp?: string | null;
  riskScore: number;
}): ActionQueueItem | null {
  const row = input.row;
  if (!isActionableStatus(row.status)) {
    return null;
  }

  const warm = isWarmVisitor(row);
  const trigger = isTriggerLead(row, input.lastSyncAt);
  const waUrl = buildOutboundWaMeLink({
    businessName: row.business_name,
    phone: row.phone,
    whatsapp: input.whatsapp ?? null,
    prefillTemplate: copilotWhatsAppOpener(row.business_name),
    landingUrl: "",
  });
  const hasWa = Boolean(waUrl);
  const hasCall = hasCallablePhone(row.phone);

  if (!warm && !trigger && !hasWa && !hasCall) {
    return null;
  }

  let priority = input.riskScore + (row.lead_score ?? 0) * 0.1;
  const reasons: string[] = [];

  if (warm) {
    priority += 200;
    reasons.push("SafeScore visitor (7d)");
  }
  if (trigger) {
    priority += 120;
    reasons.push("Low rating + recent FSA change");
  }
  if (row.fsa_rating !== null && row.fsa_rating <= 2) {
    priority += 40;
    reasons.push(`${row.fsa_rating}★ rating`);
  }
  if (hasWa && !row.whatsapp_sent_at) {
    priority += 35;
    reasons.push("WhatsApp ready");
  }
  if (hasCall && !row.call_logged_at) {
    priority += 25;
    reasons.push("Callable");
  }
  if (row.on_delivery_app === "true") {
    priority += 10;
    reasons.push("On delivery apps");
  }

  let lane: ActionLane = "call";
  if (warm) {
    lane = hasWa ? "whatsapp" : hasCall ? "call" : "warm";
  } else if (trigger && hasWa) {
    lane = "whatsapp";
  } else if (hasWa && !row.whatsapp_sent_at) {
    lane = "whatsapp";
  } else if (hasCall) {
    lane = "call";
  }

  return {
    leadId: row.id,
    businessName: row.business_name,
    postcode: row.postcode,
    fsaRating: row.fsa_rating,
    riskScore: input.riskScore,
    leadScore: row.lead_score ?? 0,
    lane,
    priorityScore: Math.round(priority),
    reasons,
    phone: row.phone ?? null,
    whatsappUrl: waUrl,
    whatsappMessage: hasWa ? copilotWhatsAppOpener(row.business_name) : null,
    email: row.email ?? null,
    lastPreviewedAt: row.last_previewed_at ?? null,
    recentlyChanged: leadChangedSinceSync(row.updated_at, input.lastSyncAt),
    status: row.status ?? "new",
    whatsappSentAt: row.whatsapp_sent_at ?? null,
    callLoggedAt: row.call_logged_at ?? null,
  };
}

export function sortActionQueue(items: ActionQueueItem[]): ActionQueueItem[] {
  return [...items].sort((a, b) => b.priorityScore - a.priorityScore || b.leadId - a.leadId);
}
