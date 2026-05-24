export type LeadStatus =
  | "new"
  | "emailed"
  | "opted_in"
  | "trial_started"
  | "paid"
  | "unsubscribed";

export type DraftStatus = "pending" | "approved" | "rejected" | "sent";

export type EmailEventType = "sent" | "delivered" | "bounce" | "complaint";

export interface EmailDraft {
  id: number;
  leadId: number;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  status: DraftStatus;
  createdAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
  resendId: string | null;
}

export interface OutreachLead {
  id: number;
  fsaId: number;
  businessName: string;
  businessType: string;
  address: string;
  postcode: string;
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  leadScore: number;
  status: LeadStatus;
  contactedAt: string | null;
  optedInAt: string | null;
  unsubscribeToken: string | null;
}

export interface FunnelCounts {
  new: number;
  emailed: number;
  opted_in: number;
  trial_started: number;
  paid: number;
  unsubscribed: number;
  total: number;
  pendingDrafts: number;
  approvedDrafts: number;
  bounceRate: number;
  sendingPaused: boolean;
}
