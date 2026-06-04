import { authHeaders } from "../lib/auth-headers.js";
import { getControlSecret } from "../lib/control-secret.js";

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

function texasAuthHeaders(secret?: string): Record<string, string> {
  return authHeaders(secret ?? getControlSecret());
}

async function parseTexasError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchTexasLeads(
  mobileOnly: boolean,
  secret?: string,
): Promise<ApiTexasLead[]> {
  const q = mobileOnly ? "?mobileOnly=1" : "";
  const res = await fetch(`/api/texas/leads${q}`, {
    headers: texasAuthHeaders(secret),
  });
  if (!res.ok) {
    await parseTexasError(res, "Texas leads failed");
  }
  const data = (await res.json()) as { leads: ApiTexasLead[] };
  return data.leads;
}

export async function fetchTexasStats(secret?: string): Promise<TexasStats> {
  const res = await fetch("/api/texas/stats", {
    headers: texasAuthHeaders(secret),
  });
  if (!res.ok) {
    await parseTexasError(res, "Texas stats failed");
  }
  return res.json() as Promise<TexasStats>;
}

export async function startTexasFindJob(
  options: {
    mobileOnly?: boolean;
    limit?: number;
  },
  secret?: string,
): Promise<{ jobId: string }> {
  const res = await fetch("/api/texas/jobs/find", {
    method: "POST",
    headers: texasAuthHeaders(secret),
    body: JSON.stringify({
      mobileOnly: options.mobileOnly === true,
      limit: options.limit ?? 500,
      source: "austin",
    }),
  });
  if (!res.ok) {
    await parseTexasError(res, "Texas find failed");
  }
  return res.json() as Promise<{ jobId: string }>;
}
