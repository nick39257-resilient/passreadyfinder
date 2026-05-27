import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFunnel, type FunnelStats } from "./api/funnel";
import { startDraftJob, startFindJob, startSendJob } from "./api/jobs";
import { fetchAppConfig } from "./api/config";
import {
  fetchLeads,
  fetchLeadDetail,
  markLeadConvertedApi,
  queueLeadToPostboxApi,
  quickDraftLead,
  stopLeadSequence,
  type ApiLead,
} from "./api/leads";
import { fetchSendPreview, type SendPreviewResponse } from "./api/send";
import {
  fetchSystemStatus,
  type DailySendQuota,
  type SystemPulseState,
  type SystemStatusFeedItem,
  type SystemStatusResponse,
} from "./api/status";
import { ActionBanner } from "./components/ActionBanner";
import { ActivityFeed } from "./components/ActivityFeed";
import { ComplianceBanner } from "./components/ComplianceBanner";
import { FixedActionBar } from "./components/FixedActionBar";
import { LeadDetailDrawer } from "./components/LeadDetailDrawer";
import { LeadFilters } from "./components/LeadFilters";
import { LeadRow } from "./components/LeadRow";
import { OpportunityAlert } from "./components/OpportunityAlert";
import { DailySendStatus } from "./components/DailySendStatus";
import { PostboxStatus } from "./components/PostboxStatus";
import { OutreachPipeline } from "./components/OutreachPipeline";
import { FindAreaModal } from "./components/FindAreaModal";
import { SendConfirmModal } from "./components/SendConfirmModal";
import { SystemPulse } from "./components/SystemPulse";
import {
  ensureControlSecret,
  getControlSecret,
  setControlSecret,
} from "./lib/control-secret";
import { fetchJob, pollJobUntilDone } from "./lib/job-poll";
import {
  type LeadFilterKey,
  matchesLeadFilter,
} from "./lib/lead-insights";
import { dismissLead, isLeadHidden, snoozeLead } from "./lib/lead-storage";
import { isOutreachHaltedStatus } from "./lib/outreach-halt";

const STORAGE_AREA = "passready_area";
const STORAGE_POSTCODE = "passready_postcode_prefix";
const STORAGE_RATING = "passready_rating";

function canQuickDraftLead(lead: ApiLead): boolean {
  if (isOutreachHaltedStatus(lead.status)) {
    return false;
  }
  return lead.status !== "contacted" && lead.status !== "approved";
}

function countByFilter(leads: ApiLead[]): Record<LeadFilterKey, number> {
  const keys: LeadFilterKey[] = ["all", "new", "drafted", "approved", "sent", "high"];
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
  const [dailyQuota, setDailyQuota] = useState<DailySendQuota | null>(null);
  const [dailyCapResetDescription, setDailyCapResetDescription] = useState("midnight UTC");
  const [leadFilter, setLeadFilter] = useState<LeadFilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ApiLead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [hiddenVersion, setHiddenVersion] = useState(0);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    message: string;
    tone: "info" | "success" | "error";
  } | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [sendPreview, setSendPreview] = useState<SendPreviewResponse | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [findModalOpen, setFindModalOpen] = useState(false);
  const [pulseDismissed, setPulseDismissed] = useState(false);
  const [areaLabel, setAreaLabel] = useState(() => localStorage.getItem(STORAGE_AREA) ?? "Preston");
  const [postcodeLabel, setPostcodeLabel] = useState(
    () => localStorage.getItem(STORAGE_POSTCODE) ?? "",
  );

  const applySystemStatus = useCallback((status: SystemStatusResponse) => {
    if (status.pulse !== "error") {
      setPulseDismissed(false);
    }
    if (pulseDismissed && status.pulse === "error") {
      setPulse("idle");
      setPulseLabel("Idle");
      setErrorMessage(null);
    } else {
      setPulse(status.pulse);
      setPulseLabel(status.pulseLabel);
      setErrorMessage(status.errorMessage);
    }
    setActivityFeed(status.feed);
    setNeedsReviewCount(status.needsReviewCount);
    setComplianceTip(status.complianceTip);
    setDailyQuota(status.dailyQuota);
    setDailyCapResetDescription(status.dailyCapResetDescription);
  }, [pulseDismissed]);

  const clearPulseError = useCallback(() => {
    setPulseDismissed(false);
    setPulse("idle");
    setPulseLabel("Idle");
    setErrorMessage(null);
  }, []);

  const dismissPulseError = useCallback(() => {
    setPulseDismissed(true);
    setPulse("idle");
    setPulseLabel("Idle");
    setErrorMessage(null);
  }, []);

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
      applySystemStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [applySystemStatus]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void fetchAppConfig().then((config) => {
      if (config.requiresControlSecret && !getControlSecret()) {
        setBanner({
          tone: "info",
          message:
            "This server requires a control secret — tap Key (top right) and paste CONTROL_PANEL_SECRET from Render before Draft / Postbox / Find.",
        });
      }
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchSystemStatus()
        .then((status) => {
          applySystemStatus(status);
        })
        .catch(() => {
          /* keep last known status */
        });
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [applySystemStatus]);

  const visibleLeads = useMemo(() => {
    void hiddenVersion;
    return leads
      .filter((lead) => lead.status !== "contacted" && lead.status !== "nurture")
      .filter((lead) => !isLeadHidden(lead.id))
      .filter((lead) => matchesLeadFilter(lead, leadFilter))
      .sort((a, b) => {
        const ra = a.fsaRating ?? 99;
        const rb = b.fsaRating ?? 99;
        if (ra !== rb) {
          return ra - rb;
        }
        return b.riskScore - a.riskScore || b.id - a.id;
      });
  }, [leads, leadFilter, hiddenVersion]);

  const filterCounts = useMemo(
    () => countByFilter(leads.filter((l) => !isLeadHidden(l.id))),
    [leads, hiddenVersion],
  );

  const runBackgroundJob = useCallback(
    async (jobId: string, label: string) => {
      setActionBusy(true);
      setJobMessage(label);
      try {
        const { promise } = pollJobUntilDone(jobId, (job) => {
          setJobMessage(job.progress || `${label} (${job.status})`);
        });
        await promise;
        clearPulseError();
        setBanner({ tone: "success", message: "Job finished successfully." });
        await loadAll();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Job failed";
        setBanner({ tone: "error", message: msg });
      } finally {
        setActionBusy(false);
        window.setTimeout(() => setJobMessage(null), 5000);
      }
    },
    [loadAll, clearPulseError],
  );

  const openLeadDrawer = async (lead: ApiLead) => {
    setSelectedLead(lead);
    setDrawerError(null);
    setDrawerLoading(true);
    try {
      const detail = await fetchLeadDetail(lead.id);
      setSelectedLead(detail);
    } catch {
      /* keep list row data */
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleQuickDraft = async (lead: ApiLead, options?: { keepDrawerOpen?: boolean }) => {
    setDrawerError(null);
    let secret: string;
    try {
      secret = ensureControlSecret(getControlSecret());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Secret required";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
      return;
    }

    if (!canQuickDraftLead(lead)) {
      const msg = isOutreachHaltedStatus(lead.status)
        ? "Outreach is stopped for this business."
        : "Already sent — mark as replied (stop sequence) before re-drafting.";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
      return;
    }

    setBusyId(lead.id);
    setJobMessage(`Drafting ${lead.businessName}… (30–90 sec)`);
    try {
      await quickDraftLead(lead.id, secret, (progress) => {
        setJobMessage(progress);
      });
      await loadAll();
      setBanner({
        tone: "success",
        message: `Draft saved for ${lead.businessName}. Tap Send to postbox when ready.`,
      });
      if (!options?.keepDrawerOpen) {
        setSelectedLead(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Quick draft failed";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
      if (!selectedLead || selectedLead.id !== lead.id) {
        void openLeadDrawer(lead);
      }
    } finally {
      setBusyId(null);
      window.setTimeout(() => setJobMessage(null), 4000);
    }
  };

  const handleStopSequence = async (lead: ApiLead) => {
    try {
      const secret = ensureControlSecret(getControlSecret());
      setBusyId(lead.id);
      await stopLeadSequence(lead.id, secret);
      await loadAll();
      setBanner({
        tone: "success",
        message: `${lead.businessName} marked as replied — sequence stopped.`,
      });
      setSelectedLead(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not stop sequence";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkConverted = async (lead: ApiLead, stage: "opted_in" | "trial_started") => {
    try {
      const secret = ensureControlSecret(getControlSecret());
      setBusyId(lead.id);
      await markLeadConvertedApi(lead.id, stage, secret);
      await loadAll();
      setBanner({
        tone: "success",
        message: `${lead.businessName} marked as ${stage === "trial_started" ? "trial started" : "opted in"} — sequence stopped.`,
      });
      setSelectedLead(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not mark converted";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
    } finally {
      setBusyId(null);
    }
  };

  const handleQueuePostbox = async (lead: ApiLead) => {
    try {
      const secret = ensureControlSecret(getControlSecret());
      setBusyId(lead.id);
      await queueLeadToPostboxApi(lead.id, secret);
      await loadAll();
      setBanner({
        tone: "success",
        message: `${lead.businessName} added to postbox. It will send at 2:00 pm UK.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not queue to postbox";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
    } finally {
      setBusyId(null);
    }
  };

  const runFindForArea = async (form: { area: string; postcodePrefix: string }) => {
    localStorage.setItem(STORAGE_AREA, form.area);
    if (form.postcodePrefix) {
      localStorage.setItem(STORAGE_POSTCODE, form.postcodePrefix);
    } else {
      localStorage.removeItem(STORAGE_POSTCODE);
    }
    setAreaLabel(form.area);
    setPostcodeLabel(form.postcodePrefix);
    setFindModalOpen(false);

    try {
      const secret = ensureControlSecret(getControlSecret());
      setActionBusy(true);
      const jobId = await startFindJob(
        {
          area: form.area,
          postcodePrefix: form.postcodePrefix || undefined,
          worstFirst: true,
        },
        secret,
      );
      const postcodeNote = form.postcodePrefix ? ` (${form.postcodePrefix}…)` : "";
      await runBackgroundJob(jobId, `Finding takeaways in ${form.area}${postcodeNote}…`);
      setBanner({
        tone: "success",
        message: `Refreshed takeaways for ${form.area}${postcodeNote} — worst ratings first.`,
      });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "Find failed",
      });
      setActionBusy(false);
    }
  };

  const handleDraft = async () => {
    const rating = Number(localStorage.getItem(STORAGE_RATING) ?? "2");
    try {
      const secret = ensureControlSecret(getControlSecret());
      setActionBusy(true);
      const jobId = await startDraftJob(rating, secret);
      await runBackgroundJob(jobId, "Drafting messages…");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Draft failed");
      setActionBusy(false);
    }
  };

  const handleSendOpen = async () => {
    try {
      const secret = ensureControlSecret(getControlSecret());
      setActionBusy(true);
      const preview = await fetchSendPreview(secret);
      if (preview.sendLocked) {
        setBanner({
          tone: "error",
          message: preview.reason ?? "Sending locked due to bounce rate.",
        });
        return;
      }
      if (preview.sendableCount === 0 || !preview.confirmToken) {
        setBanner({
          tone: "info",
          message:
            preview.dailyCapReached
              ? "Daily send cap reached — try again tomorrow."
              : "Postbox is empty — draft a takeaway and tap Send to postbox.",
        });
        return;
      }
      setSendPreview(preview);
      setSendModalOpen(true);
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "Send preview failed",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendConfirm = async () => {
    if (!sendPreview?.confirmToken) {
      return;
    }
    try {
      const secret = ensureControlSecret(getControlSecret());
      setSendModalOpen(false);
      setActionBusy(true);
      const jobId = await startSendJob(
        sendPreview.confirmToken,
        sendPreview.sendableCount,
        secret,
      );
      setSendPreview(null);
      const job = await fetchJob(jobId);
      const result = job.result as { queued?: boolean; scheduledForUk?: string } | null;
      if (result?.queued) {
        setBanner({
          tone: "success",
          message: `Queued for 2pm UK send window (${result.scheduledForUk ?? "today at 2:00 pm UK"}).`,
        });
        clearPulseError();
        await loadAll();
        setActionBusy(false);
        return;
      }
      await runBackgroundJob(jobId, "Dispatching postbox…");
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "Send failed",
      });
      setActionBusy(false);
    }
  };

  const selectedCanDraft = selectedLead ? canQuickDraftLead(selectedLead) : false;
  const selectedHalted = selectedLead ? isOutreachHaltedStatus(selectedLead.status) : false;

  return (
    <div className="mx-auto min-h-screen max-w-lg px-3 pb-[6.5rem] pt-5 sm:px-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-500/90">
            Mission control
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-50">Command Center</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {areaLabel}
            {postcodeLabel ? ` · ${postcodeLabel}` : ""} · worst ratings first
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <SystemPulse
            pulse={pulse}
            pulseLabel={pulseLabel}
            errorMessage={errorMessage}
            needsReviewCount={needsReviewCount}
            onDismissError={dismissPulseError}
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                const s = window.prompt("CONTROL_PANEL_SECRET (saved in this browser):");
                if (s?.trim()) {
                  setControlSecret(s);
                  setBanner({ tone: "success", message: "Control secret saved for this browser." });
                }
              }}
              className="min-h-[36px] rounded-lg border border-slate-700/80 bg-slate-900/60 px-2 text-[10px] font-semibold text-slate-500"
              title="Set API secret"
            >
              Key
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={loading}
              className="min-h-[36px] rounded-lg border border-slate-700/80 bg-slate-900/60 px-2.5 text-[11px] font-semibold text-slate-400"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {banner ? (
        <ActionBanner
          message={banner.message}
          tone={banner.tone}
          onDismiss={() => setBanner(null)}
        />
      ) : null}

      {jobMessage ? (
        <ActionBanner message={jobMessage} tone="info" />
      ) : null}

      {!loading && !error ? (
        <button
          type="button"
          disabled={actionBusy}
          onClick={() => setFindModalOpen(true)}
          className="mb-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-sky-500/40 bg-sky-950/50 text-sm font-bold text-sky-100 disabled:opacity-50"
        >
          Refresh takeaways in area
        </button>
      ) : null}

      {!loading && !error ? <OpportunityAlert leads={leads} /> : null}
      <PostboxStatus queuedCount={filterCounts.approved} />
      <DailySendStatus dailyQuota={dailyQuota} resetDescription={dailyCapResetDescription} />
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
              canQuickDraft={canQuickDraftLead(lead)}
              onRowTap={() => void openLeadDrawer(lead)}
              onQuickDraft={() => void handleQuickDraft(lead)}
              onSwipeLeft={() => {
                snoozeLead(lead.id);
                setHiddenVersion((v) => v + 1);
              }}
              onSwipeRight={() => {
                if (canQuickDraftLead(lead)) {
                  void handleQuickDraft(lead);
                }
              }}
            />
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-center text-[10px] text-slate-600">
        Tap row for detail · Draft button or swipe right · Swipe left snooze 30d
      </p>

      <FixedActionBar
        disabled={actionBusy}
        onFind={() => setFindModalOpen(true)}
        onDraft={() => void handleDraft()}
        onSend={() => void handleSendOpen()}
      />

      <FindAreaModal
        open={findModalOpen}
        initialArea={localStorage.getItem(STORAGE_AREA) ?? "Preston"}
        initialPostcodePrefix={localStorage.getItem(STORAGE_POSTCODE) ?? ""}
        onConfirm={(form) => void runFindForArea(form)}
        onCancel={() => setFindModalOpen(false)}
        busy={actionBusy}
      />

      <SendConfirmModal
        open={sendModalOpen}
        approvedCount={sendPreview?.approvedCount ?? 0}
        sendableCount={sendPreview?.sendableCount ?? 0}
        dailyCap={sendPreview?.dailyQuota}
        onConfirm={() => void handleSendConfirm()}
        onCancel={() => {
          setSendModalOpen(false);
          setSendPreview(null);
        }}
        busy={actionBusy}
      />

      {selectedLead ? (
        <LeadDetailDrawer
          lead={selectedLead}
          busy={busyId === selectedLead.id || drawerLoading}
          busyLabel={
            busyId === selectedLead.id
              ? "Drafting with AI… (30–90 sec)"
              : drawerLoading
                ? "Loading FSA data…"
                : "Working…"
          }
          draftDisabled={!selectedCanDraft}
          draftDisabledReason={
            selectedCanDraft
              ? undefined
              : selectedHalted
                ? "Outreach stopped (suppressed, replied, converted, or nurture)."
                : "Already sent — stop sequence before re-drafting."
          }
          outreachHalted={selectedHalted}
          errorMessage={drawerError}
          onClose={() => {
            setSelectedLead(null);
            setDrawerError(null);
          }}
          onStopSequence={() => void handleStopSequence(selectedLead)}
          onMarkTrial={() => void handleMarkConverted(selectedLead, "trial_started")}
          onMarkOptedIn={() => void handleMarkConverted(selectedLead, "opted_in")}
          onQuickDraft={() => void handleQuickDraft(selectedLead, { keepDrawerOpen: true })}
          onQueuePostbox={() => void handleQueuePostbox(selectedLead)}
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
