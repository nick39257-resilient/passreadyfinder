import type { FunnelStats } from "../api/funnel";

const STAGES: { key: keyof FunnelStats; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "drafted", label: "Drafted" },
  { key: "approved", label: "Approved" },
  { key: "converted", label: "Converted" },
];

export function ExecutiveFunnel({ funnel }: { funnel: FunnelStats | null }) {
  if (!funnel) {
    return (
      <div className="mb-4 h-16 animate-pulse rounded-2xl bg-slate-900/80" aria-hidden />
    );
  }

  const max = Math.max(funnel.identified, 1);

  return (
    <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Executive funnel
      </h2>
      <div className="flex items-stretch gap-1">
        {STAGES.map((stage, index) => {
          const count = funnel[stage.key];
          const widthPct = Math.max(18, Math.round((count / max) * 100));
          return (
            <div key={stage.key} className="flex min-w-0 flex-1 items-center gap-1">
              <div className="min-w-0 flex-1">
                <div
                  className="rounded-lg bg-gradient-to-r from-sky-600/80 to-emerald-600/80 px-1 py-2 text-center"
                  style={{ width: `${widthPct}%`, minWidth: "2.5rem" }}
                >
                  <span className="text-sm font-bold tabular-nums">{count}</span>
                </div>
                <p className="mt-1 truncate text-[10px] font-medium uppercase text-slate-500">
                  {stage.label}
                </p>
              </div>
              {index < STAGES.length - 1 ? (
                <span className="shrink-0 text-slate-600" aria-hidden>
                  →
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
