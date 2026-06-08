import type { ApiTexasLead } from "../api/texas-leads";
import { isLiveVisitor } from "../lib/live-visitor";

export function TexasOutreachPanel({ lead }: { lead: ApiTexasLead }) {
  const liveVisitor = isLiveVisitor(lead.lastPreviewedAt);
  const channelLabel =
    lead.outreachChannel === "email"
      ? "Email outreach"
      : lead.outreachChannel === "contact_form"
        ? "Contact form"
        : "No contact path";

  return (
    <section className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
          US outreach status
        </h3>
        <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-100 ring-1 ring-amber-500/40">
          {lead.outreachComplete ? "Sent" : "Not sent yet"}
        </span>
      </div>

      {liveVisitor ? (
        <p className="mb-3 animate-pulse rounded-lg border-2 border-amber-400 bg-amber-950/50 px-3 py-2 text-xs font-semibold text-amber-100">
          Live visitor — they opened score.passready.us in the last 24 hours.
        </p>
      ) : null}

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${lead.outreachComplete ? "w-full bg-emerald-500" : "w-1/3 bg-amber-500"}`}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="rounded-md bg-slate-800 px-2 py-1 font-semibold text-slate-300">
          {channelLabel}
        </span>
        {lead.draftHasScoreLink ? (
          <span className="rounded-md bg-emerald-500/20 px-2 py-1 font-bold text-emerald-100 ring-1 ring-emerald-500/40">
            SafeScore link ready
          </span>
        ) : (
          <span className="rounded-md bg-amber-500/15 px-2 py-1 font-bold text-amber-200 ring-1 ring-amber-500/30">
            Missing score link
          </span>
        )}
        {lead.needsScoreLinkRefresh ? (
          <span className="rounded-md bg-red-500/15 px-2 py-1 font-bold text-red-200 ring-1 ring-red-500/30">
            Refresh draft
          </span>
        ) : null}
      </div>

      <a
        href={lead.trackedScoreUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block truncate rounded-lg border border-amber-600/40 bg-slate-950/80 px-3 py-2 font-mono text-[11px] text-amber-300 underline-offset-2 hover:underline"
      >
        {lead.trackedScoreUrl}
      </a>
      <p className="mt-1 text-[10px] text-slate-500">
        Tracked US link for this lead. Pixel on score.passready.us must forward{" "}
        <span className="text-slate-400">?rid=</span> for live visitor tracking.
      </p>
    </section>
  );
}
