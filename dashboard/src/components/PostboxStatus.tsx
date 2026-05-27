export function PostboxStatus({
  queuedCount,
  nextDispatchLabel = "today at 2:00 pm UK",
}: {
  queuedCount: number;
  nextDispatchLabel?: string;
}) {
  const empty = queuedCount === 0;

  return (
    <section
      className={`mb-3 rounded-xl border px-3 py-2.5 ${
        empty
          ? "border-slate-700/60 bg-slate-900/40"
          : "border-amber-500/25 bg-amber-950/25"
      }`}
      aria-label="Postbox queue"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Postbox
        </p>
        <p
          className={`text-sm font-semibold tabular-nums ${
            empty ? "text-slate-400" : "text-amber-200"
          }`}
        >
          {queuedCount} queued
        </p>
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-400">
        {empty ? (
          <>Draft a takeaway, then tap <span className="text-slate-300">Send to postbox</span>.</>
        ) : (
          <>
            <span className="font-medium text-slate-300">Dispatches {nextDispatchLabel}</span>
            <span className="text-slate-500"> · then check the Sent tab for replies</span>
          </>
        )}
      </p>
    </section>
  );
}
