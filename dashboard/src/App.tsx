import { useCallback, useEffect, useState } from "react";
import { fetchActivity } from "./api/activity";
import { fetchFunnel, type FunnelStats } from "./api/funnel";
import { startDraftJob, startFindJob } from "./api/jobs";
import { fetchLeads, fetchLeadDetail, quickDraftLead, type ApiLead } from "./api/leads";
import { ComplianceBanner } from "./components/ComplianceBanner";
import { ExecutiveFunnel } from "./components/ExecutiveFunnel";
import { FixedActionBar } from "./components/FixedActionBar";
import { LeadDetailDrawer } from "./components/LeadDetailDrawer";
import { LeadRow } from "./components/LeadRow";
import { SystemActivityBar } from "./components/SystemActivityBar";
import { dismissLead, isLeadHidden, snoozeLead } from "./lib/lead-storage";

const STORAGE_AREA = "passready_area";
const STORAGE_RATING = "passready_rating";
const STORAGE_SECRET = "control_secret";

export function App() {
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [funnel, setFunnel] = useState<FunnelStats | null>(null);
  const [complianceTip, setComplianceTip] = useState("");
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof fetchActivity>>["items"]>(
    [],
  );
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
      const [leadList, funnelStats, activityData] = await Promise.all([
        fetchLeads(),
        fetchFunnel(),
        fetchActivity(),
      ]);
      setLeads(leadList);
      setFunnel(funnelStats);
      setActivity(activityData.items);
      setComplianceTip(activityData.complianceTip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const visibleLeads = leads.filter((lead) => !isLeadHidden(lead.id));
  void hiddenVersion;

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
      window.alert("Find job started — check Engine room for progress.");
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
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-28 pt-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
            PassReady
          </p>
          <h1 className="text-2xl font-bold">Command Center</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="min-h-[48px] rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300"
        >
          Refresh
        </button>
      </header>

      <ExecutiveFunnel funnel={funnel} />
      <SystemActivityBar items={activity} complianceTip={complianceTip} />
      {complianceTip ? <ComplianceBanner tip={complianceTip} /> : null}

      {loading ? <p className="text-base text-slate-400">Loading pipeline…</p> : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4">
          <p className="text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="mt-3 min-h-[48px] rounded-xl bg-red-600 px-4 text-sm font-bold text-white"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && visibleLeads.length === 0 ? (
        <p className="text-sm text-slate-400">
          No active leads — run Find or clear snoozed/dismissed leads in browser storage.
        </p>
      ) : null}

      {!loading && !error && visibleLeads.length > 0 ? (
        <ul className="space-y-2">
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

      <p className="mt-4 text-center text-xs text-slate-500">
        Tap row for detail · Swipe right quick-draft · Swipe left snooze 30d
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
