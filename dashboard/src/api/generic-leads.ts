import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export interface GenericLead {
  id: number;
  marketId: string;
  runId: string | null;
  businessName: string;
  keyword: string | null;
  locationLabel: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  gapReasons: string[];
  priorityScore: number;
  status: string;
}

export async function fetchGenericLeads(options?: {
  marketId?: string;
  runId?: string;
  limit?: number;
}): Promise<GenericLead[]> {
  const params = new URLSearchParams();
  if (options?.marketId) {
    params.set("marketId", options.marketId);
  }
  if (options?.runId) {
    params.set("runId", options.runId);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  const qs = params.toString();
  const res = await fetchWithTimeout(`/api/generic-leads${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error("Failed to load leads");
  }
  const body = (await res.json()) as { leads: GenericLead[] };
  return body.leads;
}
