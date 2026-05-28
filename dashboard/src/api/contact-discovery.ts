import { authHeaders } from "../lib/auth-headers.js";
import { pollJobUntilDone } from "../lib/job-poll.js";

export interface ApiContactDiscovery {
  leadId: number;
  website: string | null;
  websiteSourceUrl: string | null;
  email: string | null;
  emailSourceUrl: string | null;
  contactPageUrl: string | null;
  contactFormDetected: boolean;
  contactFormSourceUrl: string | null;
  facebookUrl: string | null;
  facebookSourceUrl: string | null;
  instagramUrl: string | null;
  instagramSourceUrl: string | null;
  whatsapp: string | null;
  whatsappSourceUrl: string | null;
  phone: string | null;
  phoneSourceUrl: string | null;
  contactScore: number;
  aiSummary: string | null;
  aiRecommendedPitch: string | null;
  drafts: {
    email: string | null;
    contactForm: string | null;
    facebook: string | null;
    whatsapp: string | null;
    phoneScript: string | null;
  };
  discoveredAt: string | null;
  updatedAt: string;
  contactable: boolean;
}

export async function discoverContactRoutesApi(
  leadId: number,
  secret?: string,
  onProgress?: (message: string) => void,
): Promise<ApiContactDiscovery> {
  const res = await fetch(`/api/leads/${leadId}/discover-contacts`, {
    method: "POST",
    headers: authHeaders(secret),
  });
  const body = (await res.json().catch(() => ({}))) as {
    jobId?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `Contact discovery failed (${res.status})`);
  }
  if (res.status !== 202 || !body.jobId) {
    throw new Error("Unexpected response from contact discovery");
  }

  onProgress?.("Finding contact routes…");
  const { promise } = pollJobUntilDone(body.jobId, (job) => {
    onProgress?.(job.progress ?? "Scanning…");
  });
  await promise;

  const detailRes = await fetch(`/api/leads/${leadId}`);
  if (!detailRes.ok) {
    throw new Error("Discovery finished but could not reload lead");
  }
  const detail = (await detailRes.json()) as {
    lead?: { contactDiscovery?: ApiContactDiscovery | null };
  };
  const discovery = detail.lead?.contactDiscovery;
  if (!discovery) {
    throw new Error("Discovery finished but no contact data returned");
  }
  return discovery;
}

export async function patchContactDiscoveryApi(
  leadId: number,
  patch: Record<string, string | boolean | null | undefined>,
  secret?: string,
): Promise<ApiContactDiscovery> {
  const res = await fetch(`/api/leads/${leadId}/contact-discovery`, {
    method: "PATCH",
    headers: authHeaders(secret),
    body: JSON.stringify(patch),
  });
  const body = (await res.json().catch(() => ({}))) as {
    contactDiscovery?: ApiContactDiscovery;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `Update contact discovery failed (${res.status})`);
  }
  if (!body.contactDiscovery) {
    throw new Error("No contact discovery returned");
  }
  return body.contactDiscovery;
}
