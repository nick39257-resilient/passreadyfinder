import type { ApiLead } from "../api/leads";
import { countHighPriorityLeads } from "../lib/lead-insights";

export function OpportunityAlert({
  leads,
  onShowHighPriority,
}: {
  leads: ApiLead[];
  onShowHighPriority?: (count: number) => void;
}) {
  const count = countHighPriorityLeads(leads);

  if (count === 0) {
    return (
      <section className="mb-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-slate-900/60 p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
          AI opportunity alert
        </p>
        <p className="mt-1 text-sm leading-snug text-slate-300">
          No critical-risk leads in queue right now. Run Find to refresh your radar.
        </p>
      </section>
    );
  }

  const noun = count === 1 ? "food business" : "food businesses";
  const verb = count === 1 ? "may need" : "may need";

  return (
    <button
      type="button"
      onClick={() => onShowHighPriority?.(count)}
      className="mb-3 w-full rounded-2xl border border-rose-500/25 bg-gradient-to-br from-rose-950/35 via-slate-900/70 to-slate-950/80 p-3.5 text-left shadow-[0_0_28px_-12px_rgba(244,63,94,0.2)] transition active:scale-[0.99]"
      aria-label={`Show ${count} high priority businesses`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/90">
        AI opportunity alert
      </p>
      <p className="mt-1.5 text-base font-semibold leading-snug text-slate-50">
        <span className="text-rose-200">{count}</span> high-priority {noun} {verb} inspection
        support this week.
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Tap to view the high-priority list — then tap a lead for the FSA breakdown.
      </p>
    </button>
  );
}
