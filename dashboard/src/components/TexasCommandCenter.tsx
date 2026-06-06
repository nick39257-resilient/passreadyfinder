import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTexasLeads,
  fetchTexasAutopilotStatus,
  fetchTexasStats,
  sendTexasLeadOutreach,
  startTexasFindJob,
  type ApiTexasLead,
  type TexasAutopilotStatus,
  type TexasLeadSegment,
} from "../api/texas-leads";
import { fetchAppConfig } from "../api/config";
import {
  ensureControlSecret,
  getControlSecret,
  setControlSecret,
} from "../lib/control-secret";
import { pollJobUntilDone, type JobStatus } from "../lib/job-poll";
import {
  formatTexasField,
  formatTexasScore,
  formatTexasLocation,
  formatVendorTier,
} from "../lib/texas-lead-display";
import { TexasContactOptions } from "./TexasContactOptions";
import { TexasLeadCard } from "./TexasLeadCard";
import { AutopilotHeartbeat } from "./AutopilotHeartbeat";

function jobProgressLabel(job: JobStatus): string {
  if (typeof job.progress === "string" && job.progress.trim()) {
    return job.progress;
  }
  return formatTexasField(job.status, "Running…");
}

type RecordFilter = TexasLeadSegment;

const STORAGE_TEXAS_FILTER = "passready_texas_filter";

function readFilter(): RecordFilter {
  try {
    const stored = sessionStorage.getItem(STORAGE_TEXAS_FILTER);
    if (stored === "mobile" || stored === "hasEmail") {
      return stored;
    }
    return "all";
  } catch {
    return "all";
  }
}

export function TexasCommandCenter() {
  const [filter, setFilter] = useState<RecordFilter>(readFilter);
  const [leads, setLeads] = useState<ApiTexasLead[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    mobile: number;
    critical: number;
    readyToSend: number;
    multiChannelReady: number;
  } | null>(null);
  const [autopilot, setAutopilot] = useState<TexasAutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiTexasLead | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [needsSecret, setNeedsSecret] = useState(false);

  useEffect(() => {
    void fetchAppConfig().then((config) => {
      setNeedsSecret(config.requiresControlSecret);
      if (config.requiresControlSecret && !getControlSecret()) {
        setError(
          "Control secret required — tap Key (top right) and paste CONTROL_PANEL_SECRET from Render.",
        );
      }
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const secret = ensureControlSecret(getControlSecret());
      const [leadRows, s, a] = await Promise.all([
        fetchTexasLeads(filter, secret),
        fetchTexasStats(secret),
        fetchTexasAutopilotStatus(secret),
      ]);
      setLeads(leadRows);
      setStats(s);
      setAutopilot(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const secret = getControlSecret();
      if (!secret?.trim()) {
        return;
      }
      try {
        const next = await fetchTexasAutopilotStatus(ensureControlSecret(secret));
        if (!cancelled) {
          setAutopilot(next);
        }
      } catch {
        // ignore transient polling failures
      }
    };

    void tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const criticalLeads = useMemo(
    () => leads.filter((l) => l.isCritical),
    [leads],
  );
  const otherLeads = useMemo(
    () => leads.filter((l) => !l.isCritical),
    [leads],
  );

  const setRecordFilter = (next: RecordFilter) => {
    setFilter(next);
    try {
      sessionStorage.setItem(STORAGE_TEXAS_FILTER, next);
    } catch {
      /* ignore */
    }
  };

  const patchLeadInList = (updated: ApiTexasLead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setSelected(updated);
  };

  const runSendOutreach = async () => {
    if (!selected) {
      return;
    }
    setSendBusy(true);
    setSendFeedback({ tone: "info", text: "Running outreach…" });
    try {
      const secret = ensureControlSecret(getControlSecret());
      const { lead } = await sendTexasLeadOutreach(selected.id, secret);
      if (lead) {
        if (filter === "hasEmail" && lead.outreachComplete) {
          setLeads((prev) => prev.filter((l) => l.id !== lead.id));
          setSelected(null);
        } else {
          patchLeadInList(lead);
        }
        void fetchTexasStats(ensureControlSecret(getControlSecret())).then(setStats);
        setSendFeedback({
          tone: "success",
          text:
            lead.statusLabel ||
            (lead.status === "EMAIL_SENT" ? "Email sent" : "Form submitted"),
        });
      } else {
        setSendFeedback({ tone: "success", text: "Outreach completed." });
      }
    } catch (e) {
      setSendFeedback({
        tone: "error",
        text: e instanceof Error ? e.message : "Outreach failed",
      });
    } finally {
      setSendBusy(false);
    }
  };

  const openLead = (lead: ApiTexasLead) => {
    setSelected(lead);
    setSendFeedback(null);
    setSendBusy(false);
  };

  const runIngest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const secret = ensureControlSecret(getControlSecret());
      const { jobId } = await startTexasFindJob(
        {
          mobileOnly: filter === "mobile",
          limit: 500,
        },
        secret,
      );
      setMessage("Texas ingest running…");
      const { promise } = pollJobUntilDone(jobId, (job) => {
        setMessage(jobProgressLabel(job));
      });
      await promise;
      await load();
      setMessage("Texas ingest complete.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-[#f5f2eb] text-[#333333] md:max-w-xl lg:max-w-2xl">
      <header className="sticky top-0 z-30 border-b border-amber-900/60 bg-[#0a1218]/95 px-4 py-3 backdrop-blur">
        <div className="flex min-h-12 items-center justify-between gap-2">
          <div>
            <span className="inline-block rounded-md bg-amber-600 px-2 py-1 text-[10px] font-black tracking-widest text-slate-950">
              TEXAS COMMAND CENTER
            </span>
            <p className="mt-1 text-xs text-slate-400">US expansion · isolated from UK FSA</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                const s = window.prompt(
                  "CONTROL_PANEL_SECRET (saved in this browser):",
                  getControlSecret(),
                );
                if (s?.trim()) {
                  setControlSecret(s);
                  setError(null);
                  void load();
                }
              }}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-600 px-2 text-[10px] font-semibold text-slate-400"
              title="Set control secret (same as UK Command Center)"
            >
              Key
            </button>
            <a
              href="/dashboard/"
              className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-600 px-3 text-xs font-semibold text-slate-200"
            >
              UK →
            </a>
          </div>
        </div>
        {needsSecret && !getControlSecret() ? (
          <p className="mt-2 text-xs text-amber-300">
            Paste CONTROL_PANEL_SECRET via Key before loading or ingesting.
          </p>
        ) : null}

        <div className="mt-3">
          <AutopilotHeartbeat metadata={autopilot?.metadata} />
        </div>

        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => setRecordFilter("all")}
            className={`min-h-12 flex-1 rounded-xl px-2 text-xs font-semibold sm:text-sm ${
              filter === "all"
                ? "bg-amber-600 text-slate-950"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            All Records
          </button>
          <button
            type="button"
            onClick={() => setRecordFilter("mobile")}
            className={`min-h-12 flex-1 rounded-xl px-2 text-xs font-semibold sm:text-sm ${
              filter === "mobile"
                ? "bg-amber-600 text-slate-950"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Mobile Units
          </button>
          <button
            type="button"
            onClick={() => setRecordFilter("hasEmail")}
            className={`min-h-12 flex-1 rounded-xl px-2 text-xs font-semibold sm:text-sm ${
              filter === "hasEmail"
                ? "bg-amber-600 text-slate-950"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Ready for Outreach
          </button>
        </div>

        {stats ? (
          <p className="mt-2 text-xs text-slate-500">
            {formatTexasScore(stats.total)} total · {formatTexasScore(stats.mobile)} mobile ·{" "}
            {formatTexasScore(stats.readyToSend ?? 0)} ready to send ·{" "}
            {formatTexasScore(stats.multiChannelReady ?? 0)} multi-channel ready ·{" "}
            {formatTexasScore(stats.critical)} critical (≥79)
          </p>
        ) : null}
      </header>

      <main className="px-4 pb-28 pt-4">
        {error ? (
          <p className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-slate-800/80 p-3 text-sm text-amber-100">
            {formatTexasField(message)}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400">Loading Texas leads…</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-slate-400">
            {filter === "hasEmail"
              ? "No leads ready for outreach yet — run Apollo enrichment (npm run texas-enrich-apollo) to populate owner emails."
              : filter === "mobile"
                ? "No mobile food units in this dataset. Run ingest or switch to All Records."
                : "No Texas records yet. Run ingest to pull open-data inspections (HB 2844 mobile outreach ready)."}
          </p>
        ) : (
          <div className="space-y-6">
            {criticalLeads.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-red-400">
                  Critical intervention (risk ≥ 79)
                </h2>
                <ul className="flex flex-col gap-3">
                  {criticalLeads.map((lead) => (
                    <TexasLeadCard
                      key={lead.id}
                      lead={lead}
                      onTap={() => openLead(lead)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {otherLeads.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Other leads
                </h2>
                <ul className="flex flex-col gap-3">
                  {otherLeads.map((lead) => (
                    <TexasLeadCard
                      key={lead.id}
                      lead={lead}
                      onTap={() => openLead(lead)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-amber-900/50 bg-[#0a1218]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runIngest()}
          className="min-h-12 w-full rounded-2xl bg-amber-600 text-sm font-bold text-slate-950 disabled:opacity-50"
        >
          {busy ? "Ingesting Texas data…" : "Ingest Texas open data"}
        </button>
      </footer>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-amber-800 bg-slate-900 p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-600 text-lg text-slate-300"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <h3 className="pr-14 text-lg font-bold">
              {formatTexasField(selected.businessName, "Unknown venue")}
            </h3>
            <p className="mt-1 text-sm text-amber-300">
              Texas Risk Score: {formatTexasScore(selected.texasRiskScore)}
              {selected.interventionLevel
                ? ` · ${formatTexasField(selected.interventionLevel)}`
                : ""}
            </p>
            {selected.outreachComplete ? (
              <p className="mt-2 inline-block rounded-lg bg-emerald-900/50 px-3 py-1 text-xs font-semibold text-emerald-200">
                {formatTexasField(selected.statusLabel, selected.status)}
              </p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <dt>Status</dt>
              <dd>{formatTexasField(selected.statusLabel, selected.status)}</dd>
              <dt>Inspection</dt>
              <dd>{formatTexasScore(selected.inspectionScore)}</dd>
              <dt>Demerits</dt>
              <dd>{formatTexasScore(selected.demerits)}</dd>
              <dt>Vehicle</dt>
              <dd>{formatTexasField(selected.vehicleType)}</dd>
              <dt>Location</dt>
              <dd>{formatTexasLocation(selected)}</dd>
              <dt>Email</dt>
              <dd>{formatTexasField(selected.email)}</dd>
              <dt>Website</dt>
              <dd>{formatTexasField(selected.website)}</dd>
              <dt>DSHS license</dt>
              <dd>{formatTexasField(selected.dshsLicenseStatus)}</dd>
              <dt>HB 2844 tier</dt>
              <dd>{formatVendorTier(selected.vendorTier)}</dd>
            </dl>
            {typeof selected.hb2844DraftPreview === "string" &&
            selected.hb2844DraftPreview.trim() ? (
              <p className="mt-4 text-sm leading-relaxed text-slate-300">
                {selected.hb2844DraftPreview}
              </p>
            ) : null}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Multi-channel outreach
              </p>
              <TexasContactOptions lead={selected} />
            </div>
            {sendFeedback ? (
              <p
                className={`mt-4 rounded-lg p-3 text-sm ${
                  sendFeedback.tone === "success"
                    ? "bg-emerald-950/60 text-emerald-100"
                    : sendFeedback.tone === "error"
                      ? "bg-red-950/60 text-red-200"
                      : "bg-slate-800/80 text-amber-100"
                }`}
              >
                {formatTexasField(sendFeedback.text)}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              {!selected.outreachComplete &&
              selected.outreachChannel !== "unavailable" ? (
                <button
                  type="button"
                  disabled={sendBusy}
                  onClick={() => void runSendOutreach()}
                  className="min-h-12 w-full rounded-2xl bg-amber-600 text-sm font-bold text-slate-950 disabled:opacity-50"
                >
                  {sendBusy
                    ? "Sending…"
                    : formatTexasField(
                        selected.outreachButtonLabel,
                        "Send outreach",
                      )}
                </button>
              ) : !selected.outreachComplete ? (
                <p className="text-xs text-slate-500">
                  No email or website on file — add contact data or run Apollo enrichment
                  before outreach.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
