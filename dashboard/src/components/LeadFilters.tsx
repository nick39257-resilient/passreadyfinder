import type { LeadFilterKey } from "../lib/lead-insights";

const FILTERS: { key: LeadFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_eyes", label: "Needs Eyes" },
  { key: "new", label: "New" },
  { key: "drafted", label: "Drafted" },
  { key: "approved", label: "Postbox" },
  { key: "sent", label: "Sent" },
  { key: "high", label: "High priority" },
];

export function LeadFilters({
  value,
  onChange,
  counts,
}: {
  value: LeadFilterKey;
  onChange: (key: LeadFilterKey) => void;
  counts: Record<LeadFilterKey, number>;
}) {
  return (
    <div className="mb-3 -mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      <div className="flex gap-1.5" role="tablist" aria-label="Filter leads">
        {FILTERS.map((f) => {
          const active = value === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(f.key)}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-emerald-600/90 text-white ring-1 ring-emerald-500/50"
                  : "bg-slate-800/90 text-slate-400 ring-1 ring-slate-700/60"
              }`}
            >
              {f.label}
              <span className={`ml-1 tabular-nums ${active ? "text-emerald-100" : "text-slate-500"}`}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
