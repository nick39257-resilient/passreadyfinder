import { useCallback, useEffect, useMemo, useState } from "react";
import { exportLeadsCsv, runMarketFindAndWait } from "./api/markets";
import { fetchFloridaLeads } from "./api/florida-leads";
import { RadarMap } from "./components/radar/RadarMap";
import { ActionDesk, floridaToDesk, type DeskLead } from "./components/radar/ActionDesk";

const FLORIDA_MARKET_ID = "us_florida_food";
const ORLANDO_CENTER = { lat: 28.5383, lng: -81.3792 };

export function FloridaApp() {
  const [location, setLocation] = useState("Orlando");
  const [busy, setBusy] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const [deskLeads, setDeskLeads] = useState<DeskLead[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    const rows = await fetchFloridaLeads(300);
    setDeskLeads(floridaToDesk(rows));
  }, []);

  useEffect(() => {
    void loadResults().catch(() => undefined);
  }, [loadResults]);

  const stats = useMemo(() => {
    const total = deskLeads.length;
    const highPriority = deskLeads.filter((l) => l.priorityScore >= 60).length;
    const contactReady = deskLeads.filter((l) => Boolean(l.phone || l.email)).length;
    return { total, highPriority, contactReady };
  }, [deskLeads]);

  async function handleScan() {
    setBusy(true);
    setError(null);
    setTicker(`Scanning Florida DBPR records for ${location}…`);
    try {
      await runMarketFindAndWait({
        marketId: FLORIDA_MARKET_ID,
        location: location.trim(),
        mode: "regulated",
        onProgress: (msg) => setTicker(msg),
      });
      await loadResults();
      setTicker("Scan complete — check action desk below");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Florida scan failed");
      setTicker(null);
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    exportLeadsCsv(
      deskLeads.map((l) => ({
        businessName: l.businessName,
        subtitle: l.subtitle,
        priorityScore: l.priorityScore,
        gaps: l.gapReasons.join("; "),
        phone: l.phone,
        email: l.email,
        website: l.website,
      })),
      `passfinder-florida-${Date.now()}.csv`,
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 rounded-2xl border border-orange-900/40 bg-slate-950/80 p-4 lg:max-w-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
              Regulated compliance
            </p>
            <h1 className="mt-1 text-lg font-bold text-slate-50">Florida Food Radar</h1>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              DBPR inspection extracts — license violations, risk scores, and compliance gaps.
            </p>
          </div>

          <label className="block text-xs text-slate-400">
            City or county
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Orlando, Miami-Dade, Tampa…"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <button
            type="button"
            disabled={busy || !location.trim()}
            onClick={() => void handleScan()}
            className="min-h-11 rounded-xl bg-orange-600 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Scanning…" : "Scan area"}
          </button>

          {ticker ? (
            <p className="text-[11px] leading-snug text-orange-200/90">{ticker}</p>
          ) : null}

          <nav className="mt-auto flex flex-col gap-1 border-t border-slate-800 pt-3 text-[11px]">
            <a href="/dashboard/" className="text-slate-500 hover:text-slate-300">
              ← PassFinder radar (all markets)
            </a>
            <a href="/dashboard/texas" className="text-slate-500 hover:text-slate-300">
              Texas command center →
            </a>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <RadarMap center={ORLANDO_CENTER} pins={[]} scanning={busy} />
          {error ? (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <ActionDesk leads={deskLeads} stats={stats} onExport={handleExport} />
        </div>
      </div>
    </div>
  );
}
