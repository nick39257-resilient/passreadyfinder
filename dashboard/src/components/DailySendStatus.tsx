export interface DailyQuotaView {
  sentToday: number;
  cap: number;
  remaining: number;
}

export function DailySendStatus({
  dailyQuota,
  resetDescription,
}: {
  dailyQuota: DailyQuotaView | null;
  resetDescription?: string;
}) {
  if (!dailyQuota) {
    return (
      <div
        className="mb-3 h-10 animate-pulse rounded-xl border border-slate-700/50 bg-slate-900/40"
        aria-hidden
      />
    );
  }

  const { sentToday, cap, remaining } = dailyQuota;
  const atCap = remaining <= 0;
  const reset = resetDescription ?? "midnight UTC";

  return (
    <section
      className={`mb-3 rounded-xl border px-3 py-2.5 ${
        atCap
          ? "border-slate-600/80 bg-slate-800/50"
          : "border-emerald-500/20 bg-emerald-950/20"
      }`}
      aria-label="Daily send quota"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Sends today
        </p>
        <p
          className={`text-sm font-semibold tabular-nums ${
            atCap ? "text-slate-300" : "text-emerald-200"
          }`}
        >
          {sentToday} / {cap} sent today
        </p>
      </div>
      {atCap ? (
        <p className="mt-1 text-xs leading-snug text-slate-400">
          Daily limit reached — resets at {reset}.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-snug text-slate-400">
          <span className="font-medium text-slate-300">{remaining} left today</span>
          <span className="text-slate-500"> · cap resets {reset}</span>
        </p>
      )}
    </section>
  );
}
