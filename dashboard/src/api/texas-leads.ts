export interface ApiTexasLead {
  id: number;
  region: string;
  businessName: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  ownerName: string | null;
  inspectionScore: number | null;
  demerits: number | null;
  vehicleType: string | null;
  isMobileVendor: boolean;
  vendorTier: string | null;
  dshsLicenseStatus: string;
  texasRiskScore: number;
  interventionLevel: string | null;
  isCritical: boolean;
  lastInspectionDate: string | null;
  status: string;
  hb2844DraftPreview: string | null;
}

export interface TexasStats {
  region: string;
  total: number;
  mobile: number;
  critical: number;
}

export async function fetchTexasLeads(mobileOnly: boolean): Promise<ApiTexasLead[]> {
  const q = mobileOnly ? "?mobileOnly=1" : "";
  const res = await fetch(`/api/texas/leads${q}`);
  if (!res.ok) {
    throw new Error(`Texas leads failed (${res.status})`);
  }
  const data = (await res.json()) as { leads: ApiTexasLead[] };
  return data.leads;
}

export async function fetchTexasStats(): Promise<TexasStats> {
  const res = await fetch("/api/texas/stats");
  if (!res.ok) {
    throw new Error(`Texas stats failed (${res.status})`);
  }
  return res.json() as Promise<TexasStats>;
}

export async function startTexasFindJob(options: {
  mobileOnly?: boolean;
  limit?: number;
}): Promise<{ jobId: string }> {
  const secret = sessionStorage.getItem("passready_control_secret");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  const res = await fetch("/api/texas/jobs/find", {
    method: "POST",
    headers,
    body: JSON.stringify({
      mobileOnly: options.mobileOnly === true,
      limit: options.limit ?? 500,
      source: "austin",
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Texas find failed (${res.status})`);
  }
  return res.json() as Promise<{ jobId: string }>;
}
