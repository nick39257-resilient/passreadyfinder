import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export interface FloridaLead {
  id: number;
  businessName: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  riskLevel: string | null;
  inspectionScore: number | null;
  priorityViolations: number | null;
  lastInspectionDate: string | null;
  riskScore: number;
  status: string;
}

export async function fetchFloridaLeads(limit = 200): Promise<FloridaLead[]> {
  const res = await fetchWithTimeout(`/api/florida/leads?limit=${limit}`);
  if (!res.ok) {
    throw new Error("Failed to load Florida leads");
  }
  const body = (await res.json()) as { leads: FloridaLead[] };
  return body.leads;
}
