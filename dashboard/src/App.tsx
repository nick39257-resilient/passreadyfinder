import { useCallback, useEffect, useMemo, useState } from "react";
import { startDraftAllJob, startDraftJob, startFindJob, startSendJob } from "./api/jobs";
import { fetchAppConfig } from "./api/config";
import {
  fetchLeads,
  fetchLeadDetail,
  markNotInterestedApi,
  markLeadConvertedApi,
  markVisitedApi,
  queueLeadToPostboxApi,
  quickDraftLead,
  setLeadFlagForReviewApi,
  setLeadEmailApi,
  stopLeadSequence,
  type ApiLead,
} from "./api/leads";
import { fetchSendPreview, type SendPreviewResponse } from "./api/send";
import {
  fetchSystemStatus,
  type SystemPulseState,
  type SystemStatusResponse,
} from "./api/status";
import { discoverContactRoutesApi, patchContactDiscoveryApi } from "./api/contact-discovery";
import { ActionBanner } from "./components/ActionBanner";
import { FixedActionBar } from "./components/FixedActionBar";
import { LeadDetailDrawer } from "./components/LeadDetailDrawer";
import { LeadFilters } from "./components/LeadFilters";
import { LeadRow } from "./components/LeadRow";
import { PostboxStatus } from "./components/PostboxStatus";
import { FindAreaModal } from "./components/FindAreaModal";
import { SendConfirmModal } from "./components/SendConfirmModal";
import { SystemPulse } from "./components/SystemPulse";
import {
  ensureControlSecret,
  getControlSecret,
} from "./lib/control-secret";
import { pollJobUntilDone } from "./lib/job-poll";
import {
  type LeadFilterKey,
  showLeadInRadarList,
  isReplyLead,
  emptyStateForFilter,
} from "./lib/lead-insights";
import { dismissLead, isLeadHidden, snoozeLead } from "./lib/lead-storage";
import { isOutreachHaltedStatus } from "./lib/outreach-halt";
import { readLocal, removeLocal, writeLocal } from "./lib/safe-storage";
import { getLeadNextAction } from "./lib/lead-next-action";
import { liveVisitorSortKey } from "./lib/live-visitor";
import { TexasCommandCenter } from "./components/TexasCommandCenter";
import { AutopilotHeartbeat } from "./components/AutopilotHeartbeat";
import { fetchUkAutopilotStatus } from "./api/uk-autopilot";
import { fetchScoreTrafficStats, type ScoreTrafficStats } from "./api/score-traffic";
import type { AutopilotStatusMetadata } from "./lib/autopilot-heartbeat";
import { MobileAutopilotTrigger } from "./components/MobileAutopilotTrigger";
import { OutreachScoreFunnel } from "./components/OutreachScoreFunnel";
import { DeliverabilityPanel } from "./components/DeliverabilityPanel";
import { ActionCenter } from "./components/ActionCenter";

function isTexasCommandCenterRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.pathname.includes("/texas");
}

const STORAGE_AREA = "passready_area";
const STORAGE_POSTCODE = "passready_postcode_prefix";
const STORAGE_RATING = "passready_rating";

function canQuickDraftLead(lead: ApiLead): boolean {
  if (isOutreachHaltedStatus(lead.status)) {
    return false;
  }
  if (lead.sequenceComplete) {
    return false;
  }
  return lead.status !== "approved";
}

function countByFilter(
  leads: ApiLead[],
  isHidden: (leadId: number) => boolean,
): Record<LeadFilterKey, number> {
  const keys: LeadFilterKey[] = [
    "all",
    "changed",
    "needs_eyes",
    "approved",
    "sent",
    "replies",
    "call",
    "whatsapp",
    "contactable",
    "new",
    "drafted",
    "high",
  ];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      leads.filter((l) => !isHidden(l.id) && showLeadInRadarList(l, key)).length,
    ]),
  ) as Record<LeadFilterKey, number>;
}

export function App() {
  if (isTexasCommandCenterRoute()) {
    return <TexasCommandCenter />;
  }

  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [pulse, setPulse] = useState<SystemPulseState>("idle");
  const [pulseLabel, setPulseLabel] = useState("Idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [leadFilter, setLeadFilter] = useState<LeadFilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ApiLead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyLabel, setBusyLabel] = useState("Working…");
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
  const [areaLabel, setAreaLabel] = useState(() => readLocal(STORAGE_AREA) ?? "UK");
  const [postcodeLabel, setPostcodeLabel] = useState(
    () => readLocal(STORAGE_POSTCODE) ?? "",
  );
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [postbox, setPostbox] = useState({ queued: 0, sendReady: 0, blocked: 0 });
  const [outreachLandingUrl, setOutreachLandingUrl] = useState(
    "https://score.passready.uk",
  );
  const [ukAutopilot, setUkAutopilot] = useState<AutopilotStatusMetadata | null>(
    null,
  );
  const [scoreTraffic, setScoreTraffic] = useState<ScoreTrafficStats | null>(null);

  const refreshUkAutopilotStatus = useCallback(async () => {
    try {
      const next = await fetchUkAutopilotStatus();
      setUkAutopilot(next.metadata);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshScoreTraffic = useCallback(async () => {
    try {
      const stats = await fetchScoreTrafficStats();
      setScoreTraffic(stats);
    } catch {
      /* ignore */
    }
  }, []);

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
    setNeedsReviewCount(status.needsReviewCount);
    setPostbox(status.postbox ?? { queued: 0, sendReady: 0, blocked: 0 });
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
      const [{ leads: leadList, sync }, status] = await Promise.all([
        fetchLeads(),
        fetchSystemStatus(),
      ]);
      setLeads(leadList);
      setSyncLabel(sync?.label ?? null);
      applySystemStatus(status);
      void refreshUkAutopilotStatus();
      void refreshScoreTraffic();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [applySystemStatus, refreshUkAutopilotStatus, refreshScoreTraffic]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void fetchAppConfig().then((config) => {
      if (config.outreachLandingUrl?.trim()) {
        setOutreachLandingUrl(config.outreachLandingUrl.trim());
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

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchUkAutopilotStatus();
        if (!cancelled) {
          setUkAutopilot(next.metadata);
        }
      } catch {
        /* ignore transient polling failures */
      }
    };

    void tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const stats = await fetchScoreTrafficStats();
        if (!cancelled) {
          setScoreTraffic(stats);
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const visibleLeads = useMemo(() => {
    void hiddenVersion;
    return leads
      .filter((lead) => !isLeadHidden(lead.id))
      .filter((lead) => showLeadInRadarList(lead, leadFilter))
      .sort((a, b) => {
        const liveDelta = liveVisitorSortKey(b.lastPreviewedAt) - liveVisitorSortKey(a.lastPreviewedAt);
        if (liveDelta !== 0) {
          return liveDelta;
        }
        const ra = a.fsaRating ?? 99;
        const rb = b.fsaRating ?? 99;
        if (ra !== rb) {
          return ra - rb;
        }
        return b.riskScore - a.riskScore || b.id - a.id;
      });
  }, [leads, leadFilter, hiddenVersion]);

  const filterCounts = useMemo(
    () => countByFilter(leads, isLeadHidden),
    [leads, hiddenVersion],
  );

  const runBackgroundJob = useCallback(
    async (
      jobId: string,
      label: string,
      successMessage?: (result: unknown) => string,
    ) => {
      setActionBusy(true);
      setJobMessage(label);
      try {
        const { promise } = pollJobUntilDone(jobId, (job) => {
          setJobMessage(job.progress || `${label} (${job.status})`);
        });
        const job = await promise;
        clearPulseError();
        const custom = successMessage?.(job.result);
        setBanner({
          tone: "success",
          message: custom ?? "Job finished successfully.",
        });
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

  const handleDiscoverContacts = async (lead: ApiLead) => {
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

    setBusyId(lead.id);
    setBusyLabel("Finding contact routes…");
    setJobMessage(`Finding contact routes for ${lead.businessName}…`);
    try {
      const discovery = await discoverContactRoutesApi(lead.id, secret, (progress) => {
        setJobMessage(progress);
        setBusyLabel(progress);
      });
      await loadAll();
      const detail = await fetchLeadDetail(lead.id);
      setSelectedLead(detail);
      setBanner({
        tone: "success",
        message: `Contact score ${discovery.contactScore}/100 for ${lead.businessName}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Contact discovery failed";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
    } finally {
      setBusyId(null);
      setBusyLabel("Working…");
      window.setTimeout(() => setJobMessage(null), 5000);
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
        : lead.sequenceComplete
          ? "This lead has finished the 4-touch sequence."
          : "Lead is in postbox — wait for send or remove from queue before re-drafting.";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
      return;
    }

    setBusyId(lead.id);
    setBusyLabel("Drafting with AI…");
    setJobMessage(`Drafting ${lead.businessName}… (30–90 sec)`);
    try {
      const outcome = await quickDraftLead(lead.id, secret, (progress) => {
        setJobMessage(progress);
      });
      await loadAll();
      if (outcome.lane === "postbox") {
        const hasLink = outcome.draft.includes("score.passready");
        setBanner({
          tone: "success",
          message: hasLink
            ? `${lead.businessName} drafted with SafeScore link — queued for 2pm UK.`
            : `${lead.businessName} drafted and queued — auto-sends at 2pm UK.`,
        });
      } else if (outcome.reason === "missing_business_email") {
        setBanner({
          tone: "info",
          message: `Draft saved. Add an email for ${lead.businessName} to queue for send.`,
        });
      } else {
        setBanner({
          tone: "info",
          message: `Draft saved for ${lead.businessName} — open it to review or add to postbox.`,
        });
      }
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

      if (!lead.email?.trim()) {
        const hint = lead.contactDiscovery?.email?.trim() ?? "";
        const entered = window.prompt(
          `${lead.businessName} needs a business email before it can send.\n\nEnter email:`,
          hint,
        );
        if (!entered?.trim()) {
          setBanner({ tone: "info", message: "Add an email to queue this lead for send." });
          return;
        }
        await setLeadEmailApi(lead.id, entered.trim(), secret);
      }

      await queueLeadToPostboxApi(lead.id, secret);
      await loadAll();
      setBanner({
        tone: "success",
        message: `${lead.businessName} in postbox — auto-sends at 2pm UK (or tap Send now).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not queue to postbox";
      setDrawerError(msg);
      setBanner({ tone: "error", message: msg });
    } finally {
      setBusyId(null);
    }
  };

  const promptAndSetEmail = async (lead: ApiLead): Promise<boolean> => {
    try {
      const secret = ensureControlSecret(getControlSecret());
      const hint = lead.contactDiscovery?.email?.trim() ?? lead.email ?? "";
      const entered = window.prompt(`Business email for ${lead.businessName}:`, hint);
      if (!entered?.trim()) {
        return false;
      }
      setBusyId(lead.id);
      await setLeadEmailApi(lead.id, entered.trim(), secret);
      await loadAll();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save email";
      setBanner({ tone: "error", message: msg });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleLeadAction = (lead: ApiLead) => {
    const kind = getLeadNextAction(lead).kind;
    switch (kind) {
      case "draft":
        void handleQuickDraft(lead);
        break;
      case "add_email":
        void (async () => {
          const saved = await promptAndSetEmail(lead);
          if (saved && lead.status === "drafted") {
            void handleQueuePostbox(lead);
          } else if (saved) {
            setBanner({ tone: "success", message: `Email saved for ${lead.businessName}.` });
          }
        })();
        break;
      case "postbox":
        void handleQueuePostbox(lead);
        break;
      case "find_contacts":
        void handleDiscoverContacts(lead);
        break;
      default:
        void openLeadDrawer(lead);
        break;
    }
  };

  const runFindForArea = async (form: {
    area: string;
    postcodePrefix: string;
    fullResync: boolean;
  }) => {
    writeLocal(STORAGE_AREA, form.area);
    if (form.postcodePrefix) {
      writeLocal(STORAGE_POSTCODE, form.postcodePrefix);
    } else {
      removeLocal(STORAGE_POSTCODE);
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
          fullResync: form.fullResync,
        },
        secret,
      );
      const postcodeNote = form.postcodePrefix ? ` (${form.postcodePrefix}…)` : "";
      const label = form.fullResync
        ? `Full FSA rescan in ${form.area}${postcodeNote}…`
        : `Checking FSA changes in ${form.area}${postcodeNote}…`;
      await runBackgroundJob(jobId, label, (result) => {
        const r = result as { stored?: number; deltaRows?: number; deltaMode?: boolean } | null;
        const stored = r?.stored ?? 0;
        if (form.fullResync) {
          return `${stored} takeaway(s) imported for ${form.area}${postcodeNote}.`;
        }
        if (r?.deltaMode) {
          return stored > 0
            ? `${stored} new/changed takeaway(s) — tap New/changed filter.`
            : `No FSA rating changes since last check.`;
        }
        return `${stored} takeaway(s) ready in ${form.area}${postcodeNote}.`;
      });
      if (!form.fullResync) {
        setLeadFilter("changed");
      }
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "Find failed",
      });
      setActionBusy(false);
    }
  };

  const handleDraft = async () => {
    const rating = Number(readLocal(STORAGE_RATING) ?? "2");
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

  const handleAutoDraftAll = async () => {
    try {
      const secret = ensureControlSecret(getControlSecret());
      setActionBusy(true);
      const jobId = await startDraftAllJob(secret);
      await runBackgroundJob(jobId, "Auto-drafting takeaways…");
      setLeadFilter("drafted");
      setBanner({ tone: "success", message: "Auto-draft complete — review drafts below." });
    } catch (err) {
      setBanner({
        tone: "error",
        message: err instanceof Error ? err.message : "Auto-draft failed",
      });
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
      if (preview.sendableCount === 0) {
        setBanner({
          tone: "info",
          message:
            preview.dailyCapReached
              ? "Daily send cap reached — try again tomorrow."
              : "Postbox is empty — draft a lead with an email first.",
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
    if (!sendPreview || sendPreview.sendableCount === 0) {
      return;
    }
    try {
      const secret = ensureControlSecret(getControlSecret());
      setSendModalOpen(false);
      const jobId = await startSendJob(secret);
      setSendPreview(null);
      await runBackgroundJob(jobId, "Sending emails…", (result) => {
        const r = result as { sent?: number; errors?: unknown[] } | null;
        const sent = r?.sent ?? 0;
        const errors = r?.errors?.length ?? 0;
        if (sent > 0) {
          return `Sent ${sent} email${sent === 1 ? "" : "s"}${errors > 0 ? ` (${errors} failed)` : ""}.`;
        }
        return "Send finished — no emails went out (check postbox has emails).";
      });
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
      <MobileAutopilotTrigger
        mode="uk"
        onRunStarted={() => {
          setUkAutopilot((prev) =>
            prev
              ? { ...prev, engineStatus: "Processing" }
              : { engineStatus: "Processing", lastRunTimestamp: null, totalFormsSubmitted: 0 },
          );
        }}
        onRunFailed={() => {
          void refreshUkAutopilotStatus();
        }}
        onRunComplete={() => {
          void refreshUkAutopilotStatus();
          void refreshScoreTraffic();
          void loadAll();
        }}
      />

      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-500/90">
            Mission control
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-50">Command Center</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            UK takeaways with email · ≤4★ · 30/day send cap
          </p>
          <a
            href="/dashboard/texas"
            className="mt-2 inline-flex min-h-12 items-center rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 text-xs font-semibold text-amber-200"
          >
            Texas Command Center →
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <SystemPulse
            pulse={pulse}
            pulseLabel={pulseLabel}
            errorMessage={errorMessage}
            needsReviewCount={needsReviewCount}
            onDismissError={dismissPulseError}
            onShowNeedsReview={() => {
              setLeadFilter("drafted");
              window.scrollTo({ top: 380, behavior: "smooth" });
            }}
          />
          <div className="flex gap-1">
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

      <div className="mb-4">
        <AutopilotHeartbeat metadata={ukAutopilot} />
      </div>

      <ActionCenter
        onOpenLead={(leadId) => {
          const lead = leads.find((l) => l.id === leadId);
          if (lead) {
            setSelectedLead(lead);
            return;
          }
          void fetchLeadDetail(leadId).then((detail) => {
            if (detail) setSelectedLead(detail);
          });
        }}
      />

      <DeliverabilityPanel />

      <OutreachScoreFunnel leads={leads} scoreTraffic={scoreTraffic} />

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
        <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-200">
          {(filterCounts.needs_eyes ?? 0) === 0 &&
          (filterCounts.approved ?? 0) === 0 &&
          leads.filter(isReplyLead).length === 0 ? (
            <span>Nothing needs you right now. ✓</span>
          ) : (
            <span className="tabular-nums">
              {filterCounts.needs_eyes} drafts need your eyes · {filterCounts.approved} queued for 2pm ·{" "}
              {leads.filter(isReplyLead).length} marked repl{leads.filter(isReplyLead).length === 1 ? "y" : "ies"} — check Gmail, then tap <strong className="font-semibold text-slate-100">Sent</strong> → open lead → <strong className="font-semibold text-slate-100">Replied</strong>
            </span>
          )}
        </div>
      ) : null}

      <PostboxStatus
        queuedCount={postbox.queued}
        sendReadyCount={postbox.sendReady}
        blockedCount={postbox.blocked}
      />
      {syncLabel ? (
        <p className="mb-3 text-[11px] leading-snug text-slate-500">{syncLabel}</p>
      ) : null}

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
        <p className="py-8 text-center text-sm leading-relaxed text-slate-500">
          {emptyStateForFilter(leadFilter)}
        </p>
      ) : null}

      {!loading && !error && visibleLeads.length > 0 ? (
        <ul className="space-y-2.5">
          {visibleLeads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              busy={busyId === lead.id}
              busyLabel={busyId === lead.id ? busyLabel : "Working…"}
              onRowTap={() => void openLeadDrawer(lead)}
              onAction={() => handleLeadAction(lead)}
              onSwipeLeft={() => {
                snoozeLead(lead.id);
                setHiddenVersion((v) => v + 1);
              }}
              onSwipeRight={() => handleLeadAction(lead)}
              emphasizePhone={leadFilter === "call"}
              emphasizeWhatsApp={leadFilter === "whatsapp"}
            />
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-center text-[10px] text-slate-600">
        Tap row for detail · Swipe right for next action · Swipe left snooze
      </p>

      <FixedActionBar
        disabled={actionBusy}
        onFind={() => setFindModalOpen(true)}
        onDraft={() => void handleAutoDraftAll()}
        onSend={() => void handleSendOpen()}
      />

      <FindAreaModal
        open={findModalOpen}
        initialArea={readLocal(STORAGE_AREA) ?? "UK"}
        initialPostcodePrefix={readLocal(STORAGE_POSTCODE) ?? ""}
        onConfirm={(form) => void runFindForArea(form)}
        onCancel={() => setFindModalOpen(false)}
        busy={actionBusy}
      />

      <SendConfirmModal
        open={sendModalOpen}
        approvedCount={sendPreview?.approvedCount ?? 0}
        sendReadyCount={sendPreview?.sendReadyCount ?? sendPreview?.sendableCount ?? 0}
        sendableCount={sendPreview?.sendableCount ?? 0}
        blockedCount={sendPreview?.blockedCount ?? 0}
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
          outreachLandingUrl={outreachLandingUrl}
          busy={busyId === selectedLead.id || drawerLoading}
          busyLabel={
            busyId === selectedLead.id
              ? busyLabel
              : drawerLoading
                ? "Loading…"
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
          onSetEmail={(email) => {
            void (async () => {
              try {
                const secret = ensureControlSecret(getControlSecret());
                setBusyId(selectedLead.id);
                await setLeadEmailApi(selectedLead.id, email, secret);
                await loadAll();
                setBanner({ tone: "success", message: "Business email saved." });
              } catch (err) {
                setBanner({
                  tone: "error",
                  message: err instanceof Error ? err.message : "Could not save email",
                });
              } finally {
                setBusyId(null);
              }
            })();
          }}
          onSetFlagForReview={(flagged) => {
            void (async () => {
              try {
                const secret = ensureControlSecret(getControlSecret());
                setBusyId(selectedLead.id);
                await setLeadFlagForReviewApi(selectedLead.id, flagged, secret);
                await loadAll();
                setBanner({
                  tone: "success",
                  message: flagged ? "Flagged for review (Needs Eyes)." : "Review flag cleared.",
                });
              } catch (err) {
                setBanner({
                  tone: "error",
                  message: err instanceof Error ? err.message : "Could not update review flag",
                });
              } finally {
                setBusyId(null);
              }
            })();
          }}
          onMarkNotInterested={() => {
            void (async () => {
              try {
                const secret = ensureControlSecret(getControlSecret());
                setBusyId(selectedLead.id);
                await markNotInterestedApi(selectedLead.id, secret);
                await loadAll();
                setBanner({ tone: "success", message: "Marked not interested (suppressed)." });
                setSelectedLead(null);
              } catch (err) {
                setBanner({
                  tone: "error",
                  message: err instanceof Error ? err.message : "Could not mark not interested",
                });
              } finally {
                setBusyId(null);
              }
            })();
          }}
          onMarkVisited={() => {
            void (async () => {
              try {
                const secret = ensureControlSecret(getControlSecret());
                setBusyId(selectedLead.id);
                await markVisitedApi(selectedLead.id, secret);
                await loadAll();
                setBanner({ tone: "success", message: "Marked visited." });
                setSelectedLead(null);
              } catch (err) {
                setBanner({
                  tone: "error",
                  message: err instanceof Error ? err.message : "Could not mark visited",
                });
              } finally {
                setBusyId(null);
              }
            })();
          }}
          onOpenFind={() => setFindModalOpen(true)}
          onDiscoverContacts={() => void handleDiscoverContacts(selectedLead)}
          onSaveContactManual={(patch) => {
            void (async () => {
              try {
                const secret = ensureControlSecret(getControlSecret());
                setBusyId(selectedLead.id);
                await patchContactDiscoveryApi(selectedLead.id, patch, secret);
                await loadAll();
                const detail = await fetchLeadDetail(selectedLead.id);
                setSelectedLead(detail);
                setBanner({ tone: "success", message: "Contact overrides saved." });
              } catch (err) {
                setBanner({
                  tone: "error",
                  message: err instanceof Error ? err.message : "Could not save overrides",
                });
              } finally {
                setBusyId(null);
              }
            })();
          }}
          onLoadFullDetail={() => {
            void (async () => {
              try {
                setDrawerLoading(true);
                const detail = await fetchLeadDetail(selectedLead.id);
                setSelectedLead(detail);
              } finally {
                setDrawerLoading(false);
              }
            })();
          }}
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
