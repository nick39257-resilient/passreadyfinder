import { useCallback, useEffect, useState } from "react";
import { fetchLeads, type ApiLead } from "./api/leads";
import { ActionCard } from "./components/ActionCard";

function formatLeadDetail(lead: ApiLead): string {
  const rating = lead.fsaRating === null ? "Unrated" : `${lead.fsaRating}★ FSA`;
  return `${lead.postcode} · ${rating}`;
}

export function App() {
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setLeads(await fetchLeads());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
            PassReady
          </p>
          <h1 className="text-2xl font-bold">Insights</h1>
        </div>
        {!loading ? (
          <button
            type="button"
            onClick={() => void loadLeads()}
            className="min-h-[48px] rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 active:scale-[0.98]"
            aria-label="Refresh leads"
          >
            Refresh
          </button>
        ) : null}
      </header>

      {loading ? (
        <p className="text-base text-slate-400">Loading leads…</p>
      ) : null}

      {!loading && error ? (
        <div className="rounded-3xl border border-red-500/30 bg-red-950/30 p-5">
          <p className="text-base text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadLeads()}
            className="mt-4 min-h-[48px] rounded-xl bg-red-600 px-4 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!loading && !error && leads.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
          <p className="text-base text-slate-300">No leads yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Run Find Leads from the{" "}
            <a href="/" className="font-semibold text-emerald-400 underline">
              control panel
            </a>
            .
          </p>
        </div>
      ) : null}

      {!loading && !error && leads.length > 0 ? (
        <ul className="space-y-4">
          {leads.map((lead) => (
            <li key={lead.id}>
              <ActionCard
                businessName={lead.businessName}
                detail={formatLeadDetail(lead)}
                riskScore={lead.riskScore}
                riskBand={lead.riskBand}
                actionLabel="Open control panel"
                onAction={() => {
                  window.location.href = "/";
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
