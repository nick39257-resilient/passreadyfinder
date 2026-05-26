import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFunnel, type FunnelStats } from "./api/funnel";
import { startDraftJob, startFindJob } from "./api/jobs";
import { fetchLeads, fetchLeadDetail, quickDraftLead, type ApiLead } from "./api/leads";
import {
  fetchSystemStatus,
  type SystemPulseState,
  type SystemStatusFeedItem,
} from "./api/status";
import { ActivityFeed } from "./components/ActivityFeed";
import { ComplianceBanner } from "./components/ComplianceBanner";
import { FixedActionBar } from "./components/FixedActionBar";
import { LeadDetailDrawer } from "./components/LeadDetailDrawer";
import { LeadFilters } from "./components/LeadFilters";
import { LeadRow } from "./components/LeadRow";
import { OpportunityAlert } from "./components/OpportunityAlert";
import { OutreachPipeline } from "./components/OutreachPipeline";
import { SystemPulse } from "./components/SystemPulse";
import {
  type LeadFilterKey,
  matchesLeadFilter,
} from "./lib/lead-insights";
import { dismissLead, isLeadHidden, snoozeLead } from "./lib/lead-storage";

const STORAGE_AREA = "passready_area";
const STORAGE_RATING = "passready_rating";
const STORAGE_SECRET = "control_secret";

function countByFilter(leads: ApiLead[]): Record<LeadFilterKey, number> {
  const keys: LeadFilterKey[] = ["all", "new", "drafted", "approved", "high"];
  return Object.fromEntries(
    keys.map((key) => [key, leads.filter((l) => matchesLeadFilter(l, key)).length]),
  ) as Record<LeadFilterKey, number>;
}

export function App() {
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [funnel, setFunnel] = useState<FunnelStats | null>(null);
  const [pulse, setPulse] = useState<SystemPulseState>("idle");
  const [pulseLabel, setPulseLabel] = useState("Idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<SystemStatusFeedItem[]>([]);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [complianceTip, setComplianceTip] = useState("");
  const [leadFilter, setLeadFilter] = useState<LeadFilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ApiLead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [hiddenVersion, setHiddenVersion] = useState(0);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadList, funnelStats, status] = await Promise.all([
        fetchLeads(),
        fetchFunnel(),
        fetchSystemStatus(),
      ]);
      setLeads(leadList);
      setFunnel(funnelStats);
      setPulse(status.pulse);
      setPulseLabel(status.pulseLabel);
      setErrorMessage(status.errorMessage);
      setActivityFeed(status.feed);
      setNeedsReviewCount(status.needsReviewCount);
      setComplianceTip(status.complianceTip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchSystemStatus()
        .then((status) => {
          setPulse(status.pulse);
          setPulseLabel(status.pulseLabel);
          setErrorMessage(status.errorMessage);
          setActivityFeed(status.feed);
          setNeedsReviewCount(status.needsReviewCount);
        })
        .catch(() => {
          /* keep last known status on poll failure */
        });
    }, 12_000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleLeads = useMemo(() => {
    void hiddenVersion;
    return leads
      .filter((lead) => !isLeadHidden(lead.id))
      .filter((lead) => matchesLeadFilter(lead, leadFilter))
      .sort((a, b) => b.riskScore - a.riskScore || b.id - a.id);
  }, [leads, leadFilter, hiddenVersion]);

  const filterCounts = useMemo(
    () => countByFilter(leads.filter((l) => !isLeadHidden(l.id))),
    [leads, hiddenVersion],
  );

  const getSecret = () => sessionStorage.getItem(STORAGE_SECRET) ?? "";

  const openLeadDrawer = async (lead: ApiLead) => {
    setSelectedLead(lead);
    setDrawerLoading(true);
    try {
      const detail = await fetchLeadDetail(lead.id);
      setSelectedLead(detail);
    } catch {
      /* keep list row data if detail fetch fails */
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleQuickDraft = async (lead: ApiLead) => {
    setBusyId(lead.id);
    try {
      await quickDraftLead(lead.id, getSecret());
      await loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Quick draft failed";
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
        const secret = window.prompt("Enter CONTROL_PANEL_SECRET for quick-draft:");
        if (secret?.trim()) {
          sessionStorage.setItem(STORAGE_SECRET, secret.trim());
          await quickDraftLead(lead.id, secret.trim());
          await loadAll();
          return;
        }
      }
      window.alert(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleFind = async () => {
    const area =
      localStorage.getItem(STORAGE_AREA) ??
      window.prompt("Local authority area (e.g. Preston)", "Preston") ??
      "Preston";
    const rating = Number(
      localStorage.getItem(STORAGE_RATING) ??
        window.prompt("FSA rating target (2-5)", "2") ??
        "2",
    );
    localStorage.setItem(STORAGE_AREA, area);
    localStorage.setItem(STORAGE_RATING, String(rating));

    setActionBusy(true);
    try {
      await startFindJob(area, rating, getSecret());
      await loadAll();
      window.alert("Find job started — check engine room for progress.");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Find failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDraft = async () => {
    const rating = Number(localStorage.getItem(STORAGE_RATING) ?? "2");
    setActionBusy(true);
    try {
      await startDraftJob(rating, getSecret());
      await loadAll();
      window.alert("Draft job started.");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg px-3 pb-[5.75rem] pt-5 sm:px-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-500/90">
            Mission control
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-50">Command Center</h1>
          <p className="mt-0.5 text-xs text-slate-500">Hygiene compliance outreach</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <SystemPulse
            pulse={pulse}
            pulseLabel={pulseLabel}
            errorMessage={errorMessage}
            needsReviewCount={needsReviewCount}
          />
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="min-h-[36px] rounded-lg border border-slate-700/80 bg-slate-900/60 px-2.5 text-[11px] font-semibold text-slate-400"
          >
            Refresh
          </button>
        </div>
      </header>

      {!loading && !error ? <OpportunityAlert leads={leads} /> : null}
      <OutreachPipeline funnel={funnel} />
      <ActivityFeed items={activityFeed} />
      {complianceTip ? <ComplianceBanner tip={complianceTip} /> : null}

      {!loading && !error ? (
        <LeadFilters value={leadFilter} onChange={setLeadFilter} counts={filterCounts} />
      ) : null}

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading radar…</p>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4">
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="mt-3 min-h-[48px] w-full rounded-xl bg-red-600/90 text-sm font-bold text-white"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && visibleLeads.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No leads match this filter — try All or run Find.
        </p>
      ) : null}

      {!loading && !error && visibleLeads.length > 0 ? (
        <ul className="space-y-2.5">
          {visibleLeads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              busy={busyId === lead.id}
              onRowTap={() => void openLeadDrawer(lead)}
              onSwipeLeft={() => {
                snoozeLead(lead.id);
                setHiddenVersion((v) => v + 1);
              }}
              onSwipeRight={() => void handleQuickDraft(lead)}
            />
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-center text-[10px] text-slate-600">
        Tap for detail · Swipe right quick-draft · Swipe left snooze 30d
      </p>

      <FixedActionBar
        disabled={actionBusy}
        onFind={() => void handleFind()}
        onDraft={() => void handleDraft()}
        onSend={() => {
          window.location.href = "/";
        }}
      />

      {selectedLead ? (
        <LeadDetailDrawer
          lead={selectedLead}
          busy={busyId === selectedLead.id || drawerLoading}
          onClose={() => setSelectedLead(null)}
          onQuickDraft={() => void handleQuickDraft(selectedLead)}
          onSnooze={() => {
            snoozeLead(selectedLead.id);
            setSelectedLead(null);
            setHiddenVersion((v) => v + 1);
          }}
          onDismiss={() => {
            dismissLead(selectedLead.id);
            setSelectedLead(null);
            setHiddenVersion((v) => v + 1);
          }}
        />
      ) : null}
    </div>
  );
}
