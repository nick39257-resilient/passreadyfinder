import type { MarketDefinition, MarketMode } from "../../api/markets";

type Props = {
  markets: MarketDefinition[];
  mode: MarketMode;
  marketId: string;
  location: string;
  keyword: string;
  busy: boolean;
  ticker: string | null;
  onModeChange: (mode: MarketMode) => void;
  onMarketChange: (id: string) => void;
  onLocationChange: (v: string) => void;
  onKeywordChange: (v: string) => void;
  onScan: () => void;
};

export function CommandPanel({
  markets,
  mode,
  marketId,
  location,
  keyword,
  busy,
  ticker,
  onModeChange,
  onMarketChange,
  onLocationChange,
  onKeywordChange,
  onScan,
}: Props) {
  const filtered = markets.filter((m) => m.mode === mode);
  const selected = markets.find((m) => m.id === marketId);
  const needsKeyword = mode === "open" || selected?.supportsKeyword;

  return (
    <aside className="flex w-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 lg:max-w-xs">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
          Command panel
        </p>
        <h1 className="mt-1 text-lg font-bold text-slate-50">PassFinder Radar</h1>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-900 p-1">
        {(["open", "regulated"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold capitalize ${
              mode === m ? "bg-cyan-900/60 text-cyan-100" : "text-slate-500"
            }`}
          >
            {m === "open" ? "Open search playground" : "Regulated compliance"}
          </button>
        ))}
      </div>

      <label className="block text-xs text-slate-400">
        Market
        <select
          value={marketId}
          onChange={(e) => onMarketChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          {filtered.map((m) => (
            <option key={m.id} value={m.id} disabled={m.status !== "active"}>
              {m.name}
              {m.status !== "active" ? " (soon)" : ""}
            </option>
          ))}
        </select>
      </label>

      {needsKeyword ? (
        <label className="block text-xs text-slate-400">
          Keyword
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="electricians, builders, takeaway…"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>
      ) : null}

      <label className="block text-xs text-slate-400">
        Location
        <input
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder={selected?.locationHint ?? "City or postcode"}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
      </label>

      <button
        type="button"
        disabled={busy || !location.trim()}
        onClick={onScan}
        className="min-h-11 rounded-xl bg-cyan-600 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Scanning…" : "Scan area"}
      </button>

      {ticker ? (
        <p className="text-[11px] leading-snug text-cyan-200/90">{ticker}</p>
      ) : null}

      <nav className="mt-auto flex flex-col gap-1 border-t border-slate-800 pt-3 text-[11px]">
        <a href="/dashboard/florida" className="text-slate-500 hover:text-slate-300">
          Florida food radar →
        </a>
        <a href="/dashboard/mfu-support" className="text-slate-500 hover:text-slate-300">
          CPF & commissary radar →
        </a>
        <a href="/dashboard/uk" className="text-slate-500 hover:text-slate-300">
          UK legacy command center →
        </a>
        <a href="/dashboard/texas" className="text-slate-500 hover:text-slate-300">
          Texas command center →
        </a>
      </nav>
    </aside>
  );
}
