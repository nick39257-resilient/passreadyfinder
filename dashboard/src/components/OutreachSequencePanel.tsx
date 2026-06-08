import type { ApiLead } from "../api/leads";
import { sequenceProgressPercent, sequenceTouchLabel } from "../lib/outreach-sequence";

const TOUCH_LABELS = [
  "First email",
  "Follow-up 1",
  "Follow-up 2",
  "Breakup",
] as const;

export function OutreachSequencePanel({
  lead,
  trackedScoreUrl,
}: {
  lead: ApiLead;
  trackedScoreUrl: string;
}) {
  const progress = sequenceProgressPercent(lead);
  const activeTouch = lead.sequenceComplete ? lead.sequenceMaxTouches : lead.sequenceTouch;

  return (
    <section className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Outreach sequence
        </h3>
        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-100 ring-1 ring-emerald-500/40">
          {sequenceTouchLabel(lead)}
        </span>
      </div>

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
          style={{ width: `${Math.max(progress, lead.touchCount > 0 ? 8 : 4)}%` }}
        />
      </div>

      <ol className="grid grid-cols-4 gap-1">
        {TOUCH_LABELS.map((label, index) => {
          const touchNum = index + 1;
          const sent = lead.touchCount >= touchNum;
          const current = !lead.sequenceComplete && activeTouch === touchNum;
          return (
            <li
              key={label}
              className={`rounded-lg border px-1 py-2 text-center ${
                sent
                  ? "border-emerald-500/50 bg-emerald-950/50"
                  : current
                    ? "border-amber-400/60 bg-amber-950/40 ring-1 ring-amber-400/40"
                    : "border-slate-700 bg-slate-950/60"
              }`}
            >
              <p
                className={`text-[9px] font-bold uppercase tracking-wide ${
                  sent ? "text-emerald-300" : current ? "text-amber-200" : "text-slate-500"
                }`}
              >
                {touchNum}
              </p>
              <p className="mt-0.5 text-[8px] leading-tight text-slate-400">{label}</p>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        {lead.draftHasScoreLink ? (
          <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-100 ring-1 ring-emerald-500/40">
            Draft has SafeScore link
          </span>
        ) : lead.draftPreview ? (
          <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/30">
            Draft missing score link — tap Re-draft
          </span>
        ) : (
          <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-400">
            No draft yet
          </span>
        )}
        {lead.contactedAt ? (
          <span className="rounded-md bg-sky-500/15 px-2 py-1 text-[10px] font-semibold text-sky-200">
            {lead.touchCount} email{lead.touchCount === 1 ? "" : "s"} sent
          </span>
        ) : null}
      </div>

      <a
        href={trackedScoreUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block truncate rounded-lg border border-emerald-600/40 bg-slate-950/80 px-3 py-2 text-[11px] font-mono text-emerald-300 underline-offset-2 hover:underline"
      >
        {trackedScoreUrl}
      </a>
      <p className="mt-1 text-[10px] text-slate-500">
        Tracked link for this lead — clicks show as Live visitor when the pixel is on your score page.
      </p>
    </section>
  );
}
