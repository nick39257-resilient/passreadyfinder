import { isOutreachHaltedStatus } from "./outreach-halt.js";
import type { LeadRow } from "./store/leads-repository.js";

export function hasCallablePhone(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

/** Leads worth a phone/WhatsApp follow-up (email outreach is thin). */
export function isCallListLead(input: {
  status: string;
  phone: string | null | undefined;
  repliedAt?: string | null;
}): boolean {
  if (isOutreachHaltedStatus(input.status)) {
    return false;
  }
  if (input.status === "replied" || input.status === "trial_started" || input.status === "opted_in") {
    return false;
  }
  if (input.repliedAt?.trim()) {
    return false;
  }
  if (!hasCallablePhone(input.phone)) {
    return false;
  }
  return ["new", "drafted", "approved", "contacted"].includes(input.status);
}

export function callListSortKey(row: LeadRow): number {
  const statusBoost =
    row.status === "contacted" ? 1000 : row.status === "approved" ? 500 : 0;
  return statusBoost + (row.lead_score ?? 0);
}
