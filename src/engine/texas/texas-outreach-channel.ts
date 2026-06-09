import { normalizeOutreachEmail } from "../outreach-halt.js";
import type { TexasLeadRow } from "../store/texas-leads-repository.js";
import {
  TEXAS_STATUS_EMAIL_SENT,
  TEXAS_STATUS_FORM_SUBMITTED,
} from "../../types/texas.js";

export type TexasOutreachChannel = "email" | "contact_form" | "unavailable";

export function isTexasOutreachComplete(status: string): boolean {
  return status === TEXAS_STATUS_EMAIL_SENT || status === TEXAS_STATUS_FORM_SUBMITTED;
}

export function resolveTexasOutreachChannel(row: TexasLeadRow): TexasOutreachChannel {
  if (isTexasOutreachComplete(row.status)) {
    return "unavailable";
  }
  if (normalizeOutreachEmail(row.email)) {
    return "email";
  }
  if (row.website?.trim()) {
    return "contact_form";
  }
  return "unavailable";
}

export function texasOutreachButtonLabel(channel: TexasOutreachChannel): string {
  if (channel === "email") {
    return "Send Email";
  }
  if (channel === "contact_form") {
    return "Submit Contact Form";
  }
  return "No contact path";
}

export function texasStatusDisplayLabel(status: string): string {
  if (status === "EMAIL_DISCOVERED") {
    return "Email Discovered";
  }
  if (status === TEXAS_STATUS_EMAIL_SENT) {
    return "Email Sent";
  }
  if (status === TEXAS_STATUS_FORM_SUBMITTED) {
    return "Form Submitted";
  }
  if (status === "ready_to_review") {
    return "Ready to review";
  }
  return status.replace(/_/g, " ");
}
