import type { ScoreTrafficStats } from "../api/score-traffic";
import type { ApiTexasLead } from "../api/texas-leads";
import { texasOutreachFunnelStats } from "../lib/texas-outreach-sequence";

export function TexasOutreachScoreFunnel({
  leads,
  scoreTraffic,
}: {
  leads: ApiTexasLead[];
  scoreTraffic: ScoreTrafficStats | null;
}) {
  const stats = texasOutreachFunnelStats(leads, scoreTraffic);

  return (
    <div className="rounded-2xl border border-amber-500/50 bg-gradient-to-br from-amber-950/50 to-slate-900/80 p-4 shadow-[0_0_24px_rgba(245,158,11,0.1)]">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
        SafeScore US funnel — score.passready.us
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        Texas outreach should include a tracked <span className="text-amber-200">?rid=</span> link.
        Refresh drafts below if the counter shows zero.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Drafts with link" value={stats.draftsWithScoreLink} hint="Ready to send" />
        <Stat label="Live visitors" value={stats.liveVisitors} hint="Opened US score (24h)" />
        <Stat label="US score hits" value={stats.usScoreHits} hint="Pixel count" />
        <Stat label="Outreach sent" value={stats.outreachSent} hint="Email or form" />
      </div>

      {stats.needsScoreLinkRefresh > 0 ? (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          <strong className="font-semibold">{stats.needsScoreLinkRefresh}</strong> lead
          {stats.needsScoreLinkRefresh === 1 ? "" : "s"} need a{" "}
          <span className="font-semibold">Refresh draft with score link</span> before send.
        </p>
      ) : stats.draftsWithScoreLink === 0 && stats.readyNotSent > 0 ? (
        <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          No score links visible yet. Open a lead and tap{" "}
          <span className="text-slate-200">Refresh draft with score link</span>.
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-amber-300">{value ?? "—"}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{hint}</p>
    </div>
  );
}
