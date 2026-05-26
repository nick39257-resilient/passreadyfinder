import { useState } from "react";
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
}: {
  pulse: SystemPulseState;
  pulseLabel: string;
  errorMessage: string | null;
  needsReviewCount: number;
}) {
  const [showError, setShowError] = useState(false);
  const styles = PULSE_STYLES[pulse];
  const isError = pulse === "error" && Boolean(errorMessage);
  const label =
    pulse === "needs_review" && needsReviewCount > 0
      ? `${pulseLabel} (${needsReviewCount})`
      : pulseLabel;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (isError) {
            setShowError((v) => !v);
          }
        }}
        className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 ${styles.ring} ${
          isError ? "cursor-pointer" : "cursor-default"
        } bg-slate-900/90`}
        aria-label={`System status: ${label}`}
        aria-expanded={isError ? showError : undefined}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
        <span className={`text-xs font-semibold uppercase tracking-wide ${styles.text}`}>
          {label}
        </span>
      </button>

      {isError && showError ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-red-500/40 bg-red-950/95 p-3 text-left shadow-lg"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-red-300">Error</p>
          <p className="mt-1 text-sm text-red-100">{errorMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
