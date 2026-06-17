import { useCallback, useEffect, useMemo, useState } from "react";
import { exportLeadsCsv, runMarketFindAndWait } from "./api/markets";
import { fetchMfuSupportFacilities } from "./api/mfu-support";
import { geocodeSearchArea } from "./api/geocode";
import { RadarMap } from "./components/radar/RadarMap";
import { ActionDesk, mfuToDesk, type DeskLead } from "./components/radar/ActionDesk";

const MFU_MARKET_ID = "us_mfu_support";

type StateScope = "ALL" | "TX" | "FL";

function scopeToKeyword(scope: StateScope): string | undefined {
  if (scope === "ALL") {
    return undefined;
  }
  return scope;
}

function scopeToApiState(scope: StateScope): "TX" | "FL" | undefined {
  if (scope === "ALL") {
    return undefined;
  }
  return scope;
}

export function MfuSupportApp() {
  const [location, setLocation] = useState("Orlando, FL");
  const [stateScope, setStateScope] = useState<StateScope>("ALL");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const [deskLeads, setDeskLeads] = useState<DeskLead[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async (searchLocation: string, scope: StateScope) => {
    const rows = await fetchMfuSupportFacilities({
      location: searchLocation,
      state: scopeToApiState(scope),
      limit: 300,
    });
    setDeskLeads(mfuToDesk(rows));
  }, []);

  useEffect(() => {
    void geocodeSearchArea(location)
      .then((geo) => {
        if (geo) {
          setMapCenter({ lat: geo.latitude, lng: geo.longitude });
        }
      })
      .catch(() => undefined);
    void loadResults(location, stateScope).catch(() => undefined);
  }, []);

  const stats = useMemo(() => {
    const total = deskLeads.length;
    const highPriority = deskLeads.filter((l) => l.priorityScore >= 60 && !l.outreachReady).length;
    const contactReady = deskLeads.filter(
      (l) => l.outreachReady || Boolean(l.phone?.trim() || l.email?.trim()),
    ).length;
    return { total, highPriority, contactReady };
  }, [deskLeads]);

  async function handleScan() {
    setBusy(true);
    setError(null);
    setTicker(`Scanning CPF / commissary registries for ${location}…`);
    void geocodeSearchArea(location)
      .then((geo) => {
        if (geo) {
          setMapCenter({ lat: geo.latitude, lng: geo.longitude });
        }
      })
      .catch(() => undefined);
    try {
      const result = (await runMarketFindAndWait({
        marketId: MFU_MARKET_ID,
        location: location.trim(),
        keyword: scopeToKeyword(stateScope) ?? null,
        mode: "regulated",
        onProgress: (msg) => setTicker(msg),
      })) as { stored?: number; details?: { texasCount?: number; floridaCount?: number } };

      await loadResults(location.trim(), stateScope);
      const count = result?.stored ?? deskLeads.length;
      const tx = result?.details?.texasCount ?? 0;
      const fl = result?.details?.floridaCount ?? 0;
      setTicker(`Scan complete — ${count} facilities indexed (TX ${tx}, FL ${fl})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFU support scan failed");
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
      `passfinder-mfu-support-${Date.now()}.csv`,
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 rounded-2xl border border-violet-900/40 bg-slate-950/80 p-4 lg:max-w-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
              MFU infrastructure
            </p>
            <h1 className="mt-1 text-lg font-bold text-slate-50">CPF & Commissary Radar</h1>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Texas Central Preparation Facilities and Florida commissaries that serve mobile food
              units — not general restaurants.
            </p>
          </div>

          <label className="block text-xs text-slate-400">
            State scope
            <select
              value={stateScope}
              onChange={(e) => setStateScope(e.target.value as StateScope)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="ALL">Texas + Florida</option>
              <option value="TX">Texas CPF only</option>
              <option value="FL">Florida commissary only</option>
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            City or region
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Orlando FL, San Antonio TX…"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <button
            type="button"
            disabled={busy || !location.trim()}
            onClick={() => void handleScan()}
            className="min-h-11 rounded-xl bg-violet-600 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Scanning…" : "Scan CPF / commissaries"}
          </button>

          {ticker ? (
            <p className="text-[11px] leading-snug text-violet-200/90">{ticker}</p>
          ) : null}

          <nav className="mt-auto flex flex-col gap-1 border-t border-slate-800 pt-3 text-[11px]">
            <a href="/dashboard/" className="text-slate-500 hover:text-slate-300">
              ← PassFinder radar (all markets)
            </a>
            <a href="/dashboard/florida" className="text-slate-500 hover:text-slate-300">
              Florida violation radar →
            </a>
            <a href="/dashboard/texas" className="text-slate-500 hover:text-slate-300">
              Texas command center →
            </a>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <RadarMap center={mapCenter} pins={[]} scanning={busy} />
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
