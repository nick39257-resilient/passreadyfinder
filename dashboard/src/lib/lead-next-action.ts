import type { ApiLead } from "../api/leads";
import { isOutreachHaltedStatus } from "./outreach-halt";

export type LeadNextActionKind =
  | "draft"
  | "add_email"
  | "postbox"
  | "find_contacts"
  | "review"
  | "replied"
  | "wait_send"
  | "open";

export interface LeadNextAction {
  kind: LeadNextActionKind;
  /** One-line guidance under the business name */
  hint: string;
  /** Primary button label on the lead row */
  buttonLabel: string;
}

function needsEyes(lead: ApiLead): boolean {
  return (
    lead.status === "drafted" &&
    (Boolean(lead.flagForReview) || Boolean(lead.needsEyesReason?.trim()))
  );
}

function missingEmailReason(lead: ApiLead): boolean {
  return lead.needsEyesReason?.trim() === "missing_business_email";
}

export function getLeadNextAction(lead: ApiLead): LeadNextAction {
  if (isOutreachHaltedStatus(lead.status)) {
    return { kind: "open", hint: "Outreach stopped", buttonLabel: "View" };
  }

  if (lead.status === "replied") {
    return { kind: "replied", hint: "They replied — pick an outcome", buttonLabel: "Handle reply" };
  }

  if (lead.status === "approved") {
    return { kind: "wait_send", hint: "Queued — auto-sends 2pm UK", buttonLabel: "View postbox" };
  }

  if (lead.status === "contacted" || lead.status === "opted_in") {
    return { kind: "open", hint: "Email sent — watch for reply", buttonLabel: "View" };
  }

  if (lead.status === "drafted") {
    if (needsEyes(lead)) {
      if (missingEmailReason(lead) || !lead.email?.trim()) {
        return { kind: "add_email", hint: "Draft ready — add email to send", buttonLabel: "Add email" };
      }
      return { kind: "review", hint: "Needs your eyes before send", buttonLabel: "Review draft" };
    }
    if (!lead.email?.trim()) {
      return { kind: "add_email", hint: "Draft ready — add email to queue", buttonLabel: "Add email" };
    }
    return { kind: "postbox", hint: "Draft ready — queue for 2pm send", buttonLabel: "Add to postbox" };
  }

  if (lead.status === "new") {
    if (!lead.email?.trim() && !lead.phone?.trim() && !lead.website?.trim()) {
      return {
        kind: "find_contacts",
        hint: "No contact yet — scan FSA + OSM (free)",
        buttonLabel: "Find contacts",
      };
    }
    if (!lead.email?.trim() && (lead.website?.trim() || lead.phone?.trim())) {
      return {
        kind: "find_contacts",
        hint: "Find email or phone before drafting",
        buttonLabel: "Find contacts",
      };
    }
    return { kind: "draft", hint: "Ready to draft outreach", buttonLabel: "Draft message" };
  }

  return { kind: "open", hint: "Open for options", buttonLabel: "View" };
}
