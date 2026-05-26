import type { RiskBand } from "../components/ActionCard";
import { authHeaders } from "../lib/auth-headers.js";

export interface RiskComponents {
  ratingPressure: number;
  inspectionStaleness: number;
  lowRatingUrgency: number;
  contactGap: number;
}

export interface FsaBreakdownScores {
  hygiene: number | null;
  structural: number | null;
  management: number | null;
}

export interface LeadSignals {
  ehoScraped: boolean;
  predictiveScore: boolean;
  draftReady: boolean;
}

export interface LocalCompetitor {
  businessName: string;
  fsaRating: number | null;
  postcode: string;
}

export interface ApiLead {
  id: number;
  fsaId: number;
  businessName: string;
  businessType: string;
  address: string;
  postcode: string;
  fsaRating: number | null;
  fsaLastInspectionDate: string | null;
  phone: string | null;
  website: string | null;
  leadScore: number;
  status: string;
  riskScore: number;
  riskBand: RiskBand;
  riskComponents: RiskComponents;
  signals: LeadSignals;
  daysSinceInspection: number | null;
  inspectionSummary: string;
  competitors: LocalCompetitor[];
  localPassReadyCount: number;
  fsaScores: FsaBreakdownScores;
  consultantTip: string | null;
  rivalBadge: string | null;
  ehoReportUrl: string;
  carrotFocusArea: string | null;
}

export async function fetchLeads(): Promise<ApiLead[]> {
  const res = await fetch("/api/leads");
  if (!res.ok) {
    throw new Error(`Failed to load leads (${res.status})`);
  }

  const data = (await res.json()) as { leads?: ApiLead[] };
  return data.leads ?? [];
}

export async function fetchLeadDetail(leadId: number): Promise<ApiLead> {
  const res = await fetch(`/api/leads/${leadId}`);
  if (!res.ok) {
    throw new Error(`Failed to load lead (${res.status})`);
  }
  const data = (await res.json()) as { lead: ApiLead };
  return data.lead;
}

export async function quickDraftLead(leadId: number, secret?: string): Promise<string> {
  const res = await fetch(`/api/leads/${leadId}/quick-draft`, {
    method: "POST",
    headers: authHeaders(secret),
  });

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: string; error?: string };

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        body.error ??
          "Unauthorized — set CONTROL_PANEL_SECRET in Render and enter it when prompted.",
      );
    }
    throw new Error(body.error ?? `Quick draft failed (${res.status})`);
  }

  return body.draft?.trim() ?? "";
}
