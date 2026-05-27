import type { RiskBand } from "../components/ActionCard";
import { authHeaders } from "../lib/auth-headers.js";
import { pollJobUntilDone } from "../lib/job-poll.js";

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

export async function quickDraftLead(
  leadId: number,
  secret?: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const res = await fetch(`/api/leads/${leadId}/quick-draft`, {
    method: "POST",
    headers: authHeaders(secret),
  });

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    draft?: string;
    jobId?: string;
    error?: string;
  };

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        body.error ??
          "Unauthorized — tap Key (top right) and paste CONTROL_PANEL_SECRET from Render.",
      );
    }
    throw new Error(body.error ?? `Quick draft failed (${res.status})`);
  }

  if (res.status === 202 && body.jobId) {
    onProgress?.("Quick draft started…");
    const { promise } = pollJobUntilDone(body.jobId, (job) => {
      onProgress?.(job.progress ?? "Drafting with AI…");
    });
    const job = await promise;
    const result = job.result as { draft?: string } | null;
    const draft = result?.draft?.trim() ?? "";
    if (!draft) {
      throw new Error("Quick draft finished but no message was saved");
    }
    return draft;
  }

  return body.draft?.trim() ?? "";
}

export async function stopLeadSequence(leadId: number, secret?: string): Promise<void> {
  const res = await fetch(`/api/leads/${leadId}/stop-sequence`, {
    method: "POST",
    headers: authHeaders(secret),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Stop sequence failed (${res.status})`);
  }
}

export async function markLeadConvertedApi(
  leadId: number,
  stage: "opted_in" | "trial_started",
  secret?: string,
): Promise<void> {
  const res = await fetch(`/api/leads/${leadId}/mark-converted`, {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify({ stage }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Mark converted failed (${res.status})`);
  }
}

export async function queueLeadToPostboxApi(leadId: number, secret?: string): Promise<void> {
  const res = await fetch(`/api/leads/${leadId}/postbox`, {
    method: "POST",
    headers: authHeaders(secret),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Queue to postbox failed (${res.status})`);
  }
}
