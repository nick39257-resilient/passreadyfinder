import { useState } from "react";
import {
  startTexasAutopilotJob,
  startUkAutopilotJob,
  triggerAutopilotRuns,
} from "../api/autopilot-trigger";
import { pollJobUntilDone } from "../lib/job-poll";

export type AutopilotTriggerMode = "uk" | "texas" | "both";

type Props = {
  /** Which regional autopilot job(s) to start. */
  mode?: AutopilotTriggerMode;
  onRunStarted?: () => void;
  onRunComplete?: () => void;
};

function buttonClassName(mode: AutopilotTriggerMode, busy: boolean): string {
  const base =
    "flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-bold text-white disabled:opacity-60";
  if (mode === "texas") {
    return `${base} bg-amber-600 shadow-lg shadow-amber-900/30 text-slate-950`;
  }
  return `${base} bg-emerald-600 shadow-lg shadow-emerald-900/30`;
}

function statusClassName(mode: AutopilotTriggerMode): string {
  return mode === "texas"
    ? "mt-2 text-center text-xs text-amber-200/90"
    : "mt-2 text-center text-xs text-emerald-200/90";
}

/** Full-width mobile trigger — starts UK, Texas, or both autopilot jobs. */
export function MobileAutopilotTrigger({
  mode = "both",
  onRunStarted,
  onRunComplete,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const handleTrigger = async () => {
    setBusy(true);
    onRunStarted?.();

    try {
      if (mode === "uk") {
        setLabel("Starting UK autopilot…");
        const { jobId } = await startUkAutopilotJob();
        setLabel("UK autopilot running…");
        const { promise } = pollJobUntilDone(jobId, (job) => {
          setLabel(`UK: ${job.progress ?? job.status}`);
        });
        await promise;
      } else if (mode === "texas") {
        setLabel("Starting Texas autopilot…");
        const { jobId } = await startTexasAutopilotJob();
        setLabel("Texas autopilot running…");
        const { promise } = pollJobUntilDone(jobId, (job) => {
          setLabel(`Texas: ${job.progress ?? job.status}`);
        });
        await promise;
      } else {
        setLabel("Starting UK + Texas autopilot…");
        const { ukJobId, texasJobId } = await triggerAutopilotRuns();
        setLabel("Autopilot running in background…");
        const { promise: ukPromise } = pollJobUntilDone(ukJobId, (job) => {
          setLabel(`UK: ${job.progress ?? job.status}`);
        });
        const { promise: texasPromise } = pollJobUntilDone(texasJobId, (job) => {
          setLabel(`Texas: ${job.progress ?? job.status}`);
        });
        await Promise.allSettled([ukPromise, texasPromise]);
      }

      setLabel("Autopilot run complete.");
      onRunComplete?.();
    } catch (err) {
      setLabel(err instanceof Error ? err.message : "Autopilot failed to start");
    } finally {
      setBusy(false);
      window.setTimeout(() => setLabel(null), 8000);
    }
  };

  return (
    <div className="mb-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleTrigger()}
        className={buttonClassName(mode, busy)}
      >
        {busy ? "Autopilot running…" : "Trigger Autopilot Run"}
      </button>
      {label ? <p className={statusClassName(mode)}>{label}</p> : null}
    </div>
  );
}
