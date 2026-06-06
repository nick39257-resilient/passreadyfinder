import {
  formatAutopilotRelativeTime,
  type AutopilotStatusMetadata,
} from "../lib/autopilot-heartbeat";

type Props = {
  metadata: AutopilotStatusMetadata | null | undefined;
  className?: string;
};

/** Mobile heartbeat strip — shared by UK Command Center and Texas Command Center. */
export function AutopilotHeartbeat({ metadata, className = "" }: Props) {
  const active = metadata?.engineStatus === "Processing";

  return (
    <div
      className={[
        "flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-200",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "h-2.5 w-2.5 rounded-full",
            active
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"
              : "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]",
          ].join(" ")}
          aria-hidden
        />
        <span className="font-semibold">Autopilot: {active ? "Active" : "Idle"}</span>
      </div>
      <div className="text-slate-300">
        Forms Sent:{" "}
        <span className="font-semibold text-slate-100">
          {metadata?.totalFormsSubmitted ?? 0}
        </span>
      </div>
      <div className="text-slate-400">
        Synced:{" "}
        <span className="font-semibold text-slate-200">
          {formatAutopilotRelativeTime(metadata?.lastRunTimestamp ?? null)}
        </span>
      </div>
    </div>
  );
}
