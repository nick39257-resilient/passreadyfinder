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
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  licenseNumber: string | null;
  riskLevel: string | null;
  inspectionScore: number | null;
  priorityViolations: number | null;
  lastInspectionDate: string | null;
  riskScore: number;
  status: string;
  enrichmentStatus: string | null;
  outreachReady: boolean;
}

export async function fetchFloridaLeads(
  limit = 200,
  location?: string,
): Promise<FloridaLead[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (location?.trim()) {
    params.set("location", location.trim());
  }
  const res = await fetchWithTimeout(`/api/florida/leads?${params}`);
  if (!res.ok) {
    throw new Error("Failed to load Florida leads");
  }
  const body = (await res.json()) as { leads: FloridaLead[] };
  return body.leads;
}

export type FloridaOutreachResponse = {
  ok: boolean;
  leadId: number;
  channel: "email" | "social";
  status: string;
  resendId?: string;
  detail: string;
};

export async function triggerFloridaOutreach(leadId: number): Promise<FloridaOutreachResponse> {
  const res = await fetchWithTimeout(`/api/florida/leads/${leadId}/trigger-outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json()) as FloridaOutreachResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Outreach failed");
  }
  return body;
}

export async function startFloridaEnrichment(location?: string, limit = 40): Promise<{ jobId: string }> {
  const res = await fetchWithTimeout("/api/florida/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location, limit }),
  });
  const body = (await res.json()) as { jobId?: string; error?: string };
  if (!res.ok || !body.jobId) {
    throw new Error(body.error ?? "Failed to start enrichment");
  }
  return { jobId: body.jobId };
}
