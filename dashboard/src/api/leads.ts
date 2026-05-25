import type { RiskBand } from "../components/ActionCard";

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
  riskScore: number;
  riskBand: RiskBand;
}

export async function fetchLeads(): Promise<ApiLead[]> {
  const res = await fetch("/api/leads");
  if (!res.ok) {
    throw new Error(`Failed to load leads (${res.status})`);
  }

  const data = (await res.json()) as { leads?: ApiLead[] };
  return data.leads ?? [];
}
