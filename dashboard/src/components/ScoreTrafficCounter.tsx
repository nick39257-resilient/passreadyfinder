import type { ScoreTrafficStats } from "../api/score-traffic";

type Props = {
  stats: ScoreTrafficStats | null;
};

export function ScoreTrafficCounter({ stats }: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 px-4 py-3 text-xs text-slate-300">
      <p className="font-semibold uppercase tracking-wider text-slate-400">
        SafeScore live traffic
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span>
          Total:{" "}
          <strong className="text-lg tabular-nums text-slate-50">
            {stats?.total ?? "—"}
          </strong>
        </span>
        <span>
          UK{" "}
          <strong className="tabular-nums text-emerald-300">{stats?.uk ?? "—"}</strong>
        </span>
        <span>
          US{" "}
          <strong className="tabular-nums text-amber-300">{stats?.us ?? "—"}</strong>
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
        score.passready.uk · score.passready.us
      </p>
    </div>
  );
}
