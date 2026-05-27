import type { SystemPulseState } from "../api/status";

const PULSE_STYLES: Record<
  SystemPulseState,
  { dot: string; text: string; ring: string }
> = {
  idle: {
    dot: "bg-slate-500",
    text: "text-slate-300",
    ring: "border-slate-700",
  },
  scraping: {
    dot: "bg-sky-400 animate-pulse",
    text: "text-sky-200",
    ring: "border-sky-500/40",
  },
  drafting: {
    dot: "bg-violet-400 animate-pulse",
    text: "text-violet-200",
    ring: "border-violet-500/40",
  },
  needs_review: {
    dot: "bg-amber-400",
    text: "text-amber-200",
    ring: "border-amber-500/40",
  },
  error: {
    dot: "bg-red-500",
    text: "text-red-200",
    ring: "border-red-500/50",
  },
};

export function SystemPulse({
  pulse,
  pulseLabel,
  errorMessage,
  needsReviewCount,
  onDismissError,
}: {
  pulse: SystemPulseState;
  pulseLabel: string;
  errorMessage: string | null;
  needsReviewCount: number;
  onDismissError?: () => void;
}) {
  const styles = PULSE_STYLES[pulse];
  const isError = pulse === "error" && Boolean(errorMessage);
  const label =
    pulse === "needs_review" && needsReviewCount > 0
      ? `${pulseLabel} (${needsReviewCount})`
      : pulseLabel;

  return (
    <button
      type="button"
      onClick={() => {
        if (isError) {
          onDismissError?.();
        }
      }}
      className={`flex min-h-[40px] items-center gap-2 rounded-lg border px-2.5 py-1.5 ${styles.ring} ${
        isError ? "cursor-pointer" : "cursor-default"
      } bg-slate-900/90`}
      aria-label={
        isError ? `Dismiss error: ${errorMessage}` : `System status: ${label}`
      }
      title={isError ? errorMessage ?? "Tap to dismiss" : undefined}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
      <span className={`text-xs font-semibold uppercase tracking-wide ${styles.text}`}>
        {label}
      </span>
    </button>
  );
}
