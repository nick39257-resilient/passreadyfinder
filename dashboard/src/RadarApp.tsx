import { useCallback, useEffect, useMemo, useState } from "react";
import {
  exportLeadsCsv,
  fetchMarkets,
  runMarketFindAndWait,
  type MarketDefinition,
  type MarketMode,
} from "./api/markets";
import { fetchGenericLeads } from "./api/generic-leads";
import { fetchFloridaLeads } from "./api/florida-leads";
import { geocodeSearchArea } from "./api/geocode";
import { CommandPanel } from "./components/radar/CommandPanel";
import { RadarMap, type RadarPin } from "./components/radar/RadarMap";
import {
  ActionDesk,
  floridaToDesk,
  genericToDesk,
  type DeskLead,
} from "./components/radar/ActionDesk";

const OPEN_SEARCH_ID = "open_search";
const FLORIDA_ID = "us_florida_food";

async function centerMapForLocation(
  location: string,
  setMapCenter: (c: { lat: number; lng: number }) => void,
): Promise<void> {
  const geo = await geocodeSearchArea(location);
  if (geo) {
    setMapCenter({ lat: geo.latitude, lng: geo.longitude });
  }
}

export function RadarApp() {
  const [markets, setMarkets] = useState<MarketDefinition[]>([]);
  const [mode, setMode] = useState<MarketMode>("open");
  const [marketId, setMarketId] = useState(OPEN_SEARCH_ID);
  const [location, setLocation] = useState("Preston, UK");
  const [keyword, setKeyword] = useState("electricians");
  const [busy, setBusy] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [deskLeads, setDeskLeads] = useState<DeskLead[]>([]);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMarkets()
      .then(setMarkets)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load markets"));
  }, []);

  useEffect(() => {
    void centerMapForLocation(location, setMapCenter).catch(() => undefined);
  }, []);

  useEffect(() => {
    const inMode = markets.filter((m) => m.mode === mode && m.status === "active");
    if (inMode.length > 0 && !inMode.some((m) => m.id === marketId)) {
      setMarketId(inMode[0].id);
    }
  }, [mode, markets, marketId]);

  const loadResults = useCallback(
    async (runId?: string | null, selectedMarket = marketId) => {
      if (selectedMarket === OPEN_SEARCH_ID) {
        const rows = await fetchGenericLeads({
          marketId: OPEN_SEARCH_ID,
          runId: runId ?? undefined,
          limit: 200,
        });
        setDeskLeads(genericToDesk(rows));
        const withCoords = rows.find((r) => r.latitude != null && r.longitude != null);
        if (withCoords?.latitude != null && withCoords.longitude != null) {
          setMapCenter({ lat: withCoords.latitude, lng: withCoords.longitude });
        }
        return;
      }
      if (selectedMarket === FLORIDA_ID) {
        const rows = await fetchFloridaLeads(300, location);
        setDeskLeads(floridaToDesk(rows));
        await centerMapForLocation(location, setMapCenter);
        return;
      }
      setDeskLeads([]);
    },
    [marketId, location],
  );

  useEffect(() => {
    void loadResults(lastRunId).catch(() => undefined);
  }, [loadResults, lastRunId]);

  const [mapPins, setMapPins] = useState<RadarPin[]>([]);
  useEffect(() => {
    if (marketId !== OPEN_SEARCH_ID) {
      setMapPins([]);
      return;
    }
    void fetchGenericLeads({
      marketId: OPEN_SEARCH_ID,
      runId: lastRunId ?? undefined,
      limit: 200,
    }).then((rows) => {
      setMapPins(
        rows
          .filter((r) => r.latitude != null && r.longitude != null)
          .map((r) => ({
            id: r.id,
            lat: r.latitude!,
            lng: r.longitude!,
            label: r.businessName,
            score: r.priorityScore,
          })),
      );
      const first = rows.find((r) => r.latitude != null && r.longitude != null);
      if (first?.latitude != null && first.longitude != null) {
        setMapCenter({ lat: first.latitude, lng: first.longitude });
      }
    });
  }, [marketId, lastRunId, deskLeads.length]);

  const stats = useMemo(() => {
    const total = deskLeads.length;
    const highPriority = deskLeads.filter((l) => l.priorityScore >= 60).length;
    const contactReady = deskLeads.filter(
      (l) => Boolean(l.phone || l.email || l.website),
    ).length;
    return { total, highPriority, contactReady };
  }, [deskLeads]);

  async function handleScan() {
    setBusy(true);
    setError(null);
    setTicker(`Scanning ${location}…`);
    void centerMapForLocation(location, setMapCenter);
    try {
      const result = (await runMarketFindAndWait({
        marketId,
        location: location.trim(),
        keyword: mode === "open" ? keyword.trim() : undefined,
        mode,
        onProgress: (msg) => setTicker(msg),
      })) as {
        details?: { runId?: string; latitude?: number; longitude?: number };
      };

      const runId = result?.details?.runId ?? null;
      setLastRunId(runId);
      if (result?.details?.latitude != null && result?.details?.longitude != null) {
        setMapCenter({
          lat: result.details.latitude,
          lng: result.details.longitude,
        });
      } else {
        await centerMapForLocation(location, setMapCenter);
      }

      await loadResults(runId, marketId);
      setTicker("Scan complete — check action desk below");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
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
      `passfinder-${marketId}-${Date.now()}.csv`,
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row">
        <CommandPanel
          markets={markets}
          mode={mode}
          marketId={marketId}
          location={location}
          keyword={keyword}
          busy={busy}
          ticker={ticker}
          onModeChange={setMode}
          onMarketChange={setMarketId}
          onLocationChange={setLocation}
          onKeywordChange={setKeyword}
          onScan={() => void handleScan()}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <RadarMap center={mapCenter} pins={mapPins} scanning={busy} />
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
