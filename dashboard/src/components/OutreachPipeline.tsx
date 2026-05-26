import type { FunnelStats } from "../api/funnel";

const STAGES: { key: keyof FunnelStats; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "drafted", label: "Drafted" },
  { key: "approved", label: "Approved" },
  { key: "converted", label: "Converted" },
];

export function OutreachPipeline({ funnel }: { funnel: FunnelStats | null }) {
  if (!funnel) {
    return (
      <div className="mb-3 h-20 animate-pulse rounded-2xl border border-slate-700/50 bg-slate-900/40" aria-hidden />
    );
  }

  const max = Math.max(funnel.identified, 1);

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 backdrop-blur-sm">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-500/90">
            PassReady radar
          </p>
          <h2 className="text-sm font-semibold text-slate-100">Outreach pipeline</h2>
        </div>
        <span className="text-[10px] text-slate-500">Live counts</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {STAGES.map((stage) => {
          const count = funnel[stage.key];
          const fill = Math.max(12, Math.round((count / max) * 100));
          return (
            <div key={stage.key} className="min-w-0">
              <div className="relative h-9 overflow-hidden rounded-lg bg-slate-950/80 ring-1 ring-slate-700/50">
                <div
                  className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-teal-600/70 to-emerald-500/50"
                  style={{ width: `${fill}%` }}
                />
                <span className="relative flex h-full items-center justify-center text-sm font-bold tabular-nums text-white">
                  {count}
                </span>
              </div>
              <p className="mt-1 truncate text-center text-[9px] font-medium uppercase tracking-wide text-slate-500">
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** @deprecated Use OutreachPipeline */
export const ExecutiveFunnel = OutreachPipeline;
