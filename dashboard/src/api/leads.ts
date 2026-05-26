import type { RiskBand } from "../components/ActionCard";

export interface RiskComponents {
  ratingPressure: number;
  inspectionStaleness: number;
  lowRatingUrgency: number;
  contactGap: number;
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
}

export async function fetchLeads(): Promise<ApiLead[]> {
  const res = await fetch("/api/leads");
  if (!res.ok) {
    throw new Error(`Failed to load leads (${res.status})`);
  }

  const data = (await res.json()) as { leads?: ApiLead[] };
  return data.leads ?? [];
}

export async function quickDraftLead(leadId: number, secret?: string): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret?.trim()) {
    headers.Authorization = `Bearer ${secret.trim()}`;
  }

  const res = await fetch(`/api/leads/${leadId}/quick-draft`, {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Quick draft failed (${res.status})`);
  }
}
