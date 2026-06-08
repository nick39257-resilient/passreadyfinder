import type { ScoreTrafficStats } from "../api/score-traffic";
import { outreachFunnelStats } from "../lib/outreach-sequence";
import type { ApiLead } from "../api/leads";

export function OutreachScoreFunnel({
  leads,
  scoreTraffic,
}: {
  leads: ApiLead[];
  scoreTraffic: ScoreTrafficStats | null;
}) {
  const stats = outreachFunnelStats(leads);

  return (
    <div className="mb-4 rounded-2xl border border-emerald-600/40 bg-gradient-to-br from-emerald-950/40 to-slate-900/80 p-4 shadow-[0_0_24px_rgba(16,185,129,0.08)]">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
        SafeScore funnel — can you see progress?
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        Re-draft old leads to refresh copy with score links. New drafts auto-include tracked URLs.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <FunnelStat
          label="Drafts with link"
          value={stats.draftsWithScoreLink}
          tone="emerald"
          hint="Ready to drive clicks"
        />
        <FunnelStat
          label="Live visitors"
          value={stats.liveVisitors}
          tone="amber"
          hint="Opened score page (24h)"
        />
        <FunnelStat
          label="Score page hits"
          value={scoreTraffic?.total ?? null}
          tone="sky"
          hint="All-time pixel count"
        />
        <FunnelStat
          label="On touch 2+"
          value={stats.onFollowUpTouch}
          tone="violet"
          hint="Follow-up sequence"
        />
      </div>

      {stats.contactedNoScoreInDraft > 0 ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          <strong className="font-semibold">{stats.contactedNoScoreInDraft}</strong> lead
          {stats.contactedNoScoreInDraft === 1 ? "" : "s"} still have{" "}
          <span className="font-semibold">old drafts without a score link</span> — open one and tap{" "}
          <span className="font-semibold">Re-draft message</span>.
        </p>
      ) : stats.draftsWithScoreLink === 0 && stats.liveVisitors === 0 ? (
        <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          No score links in drafts yet. Tap any lead → <span className="text-slate-200">Quick-draft</span> to
          generate one with a tracked URL.
        </p>
      ) : null}
    </div>
  );
}

function FunnelStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | null;
  tone: "emerald" | "amber" | "sky" | "violet";
  hint: string;
}) {
  const tones = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>
        {value ?? "—"}
      </p>
      <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{hint}</p>
    </div>
  );
}
