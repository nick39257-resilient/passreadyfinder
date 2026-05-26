export function ActionBanner({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: "info" | "success" | "error";
  onDismiss?: () => void;
}) {
  const styles =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-100"
      : tone === "error"
        ? "border-red-500/40 bg-red-950/40 text-red-100"
        : "border-sky-500/30 bg-sky-950/30 text-sky-100";

  return (
    <div className={`mb-3 flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 ${styles}`}>
      <p className="text-sm leading-snug">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-semibold opacity-70"
          aria-label="Dismiss"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
