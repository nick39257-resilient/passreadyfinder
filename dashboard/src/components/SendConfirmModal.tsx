export function SendConfirmModal({
  open,
  approvedCount,
  sendReadyCount,
  sendableCount,
  blockedCount = 0,
  dailyCap,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  approvedCount: number;
  sendReadyCount?: number;
  sendableCount: number;
  blockedCount?: number;
  dailyCap?: { sentToday: number; cap: number; remaining: number };
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-50">Send postbox now</h2>
        <p className="mt-2 text-sm text-slate-300">
          Send <strong className="text-amber-200">{sendableCount}</strong>
          {sendReadyCount !== undefined && sendReadyCount !== approvedCount ? (
            <>
              {" "}
              of <strong>{sendReadyCount}</strong> send-ready
            </>
          ) : null}{" "}
          queued email{sendableCount === 1 ? "" : "s"} now via Resend.
        </p>
        {blockedCount > 0 ? (
          <p className="mt-2 text-xs text-amber-200/90">
            {blockedCount} other queued lead{blockedCount === 1 ? "" : "s"} have missing or invalid
            emails and will be skipped.
          </p>
        ) : null}
        {dailyCap ? (
          <p className="mt-2 text-xs text-slate-500">
            Daily cap: {dailyCap.sentToday}/{dailyCap.cap} sent today ({dailyCap.remaining}{" "}
            remaining)
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Or leave them — postbox also auto-sends at 2:00 pm UK daily.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[48px] rounded-xl border border-slate-600 bg-slate-800 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || sendableCount < 1}
            className="min-h-[48px] rounded-xl bg-amber-600 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send now"}
          </button>
        </div>
      </div>
    </div>
  );
}
