import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTexasLeads,
  fetchTexasStats,
  startTexasFindJob,
  type ApiTexasLead,
} from "../api/texas-leads";
import { fetchAppConfig } from "../api/config";
import {
  ensureControlSecret,
  getControlSecret,
  setControlSecret,
} from "../lib/control-secret";
import { pollJobUntilDone } from "../lib/job-poll";
import { TexasLeadCard } from "./TexasLeadCard";

type RecordFilter = "all" | "mobile";

const STORAGE_TEXAS_FILTER = "passready_texas_filter";

function readFilter(): RecordFilter {
  try {
    return sessionStorage.getItem(STORAGE_TEXAS_FILTER) === "mobile" ? "mobile" : "all";
  } catch {
    return "all";
  }
}

export function TexasCommandCenter() {
  const [filter, setFilter] = useState<RecordFilter>(readFilter);
  const [leads, setLeads] = useState<ApiTexasLead[]>([]);
  const [stats, setStats] = useState<{ total: number; mobile: number; critical: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiTexasLead | null>(null);
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
      const [leadRows, s] = await Promise.all([
        fetchTexasLeads(filter === "mobile", secret),
        fetchTexasStats(secret),
      ]);
      setLeads(leadRows);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

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
      await pollJobUntilDone(jobId, (p) => setMessage(p));
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

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setRecordFilter("all")}
            className={`min-h-12 flex-1 rounded-xl px-3 text-sm font-semibold ${
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
            className={`min-h-12 flex-1 rounded-xl px-3 text-sm font-semibold ${
              filter === "mobile"
                ? "bg-amber-600 text-slate-950"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Mobile Food Units
          </button>
        </div>

        {stats ? (
          <p className="mt-2 text-xs text-slate-500">
            {stats.total} total · {stats.mobile} mobile · {stats.critical} critical (≥79)
          </p>
        ) : null}
      </header>

      <main className="px-4 pb-28 pt-4">
        {error ? (
          <p className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-slate-800/80 p-3 text-sm text-amber-100">{message}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400">Loading Texas leads…</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-slate-400">
            No Texas records yet. Run ingest to pull open-data inspections (HB 2844 mobile
            outreach ready).
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
                      onTap={() => setSelected(lead)}
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
                      onTap={() => setSelected(lead)}
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
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-amber-800 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">{selected.businessName}</h3>
            <p className="mt-1 text-sm text-amber-300">
              Texas Risk Score: {selected.texasRiskScore}
              {selected.interventionLevel ? ` · ${selected.interventionLevel}` : ""}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <dt>Inspection</dt>
              <dd>{selected.inspectionScore ?? "—"}</dd>
              <dt>Demerits</dt>
              <dd>{selected.demerits ?? "—"}</dd>
              <dt>Vehicle</dt>
              <dd>{selected.vehicleType ?? "—"}</dd>
              <dt>DSHS license</dt>
              <dd>{selected.dshsLicenseStatus}</dd>
              <dt>HB 2844 tier</dt>
              <dd>{selected.vendorTier ?? "—"}</dd>
            </dl>
            {selected.hb2844DraftPreview ? (
              <p className="mt-4 text-sm leading-relaxed text-slate-300">
                {selected.hb2844DraftPreview}
              </p>
            ) : null}
            <button
              type="button"
              className="mt-4 min-h-12 w-full rounded-xl bg-slate-700 text-sm font-semibold"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
