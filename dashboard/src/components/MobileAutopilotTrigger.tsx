import { useState } from "react";
import {
  startTexasAutopilotJob,
  startUkAutopilotJob,
  triggerAutopilotRuns,
  type AutopilotKickoffResponse,
} from "../api/autopilot-trigger";
import { pollJobUntilDone } from "../lib/job-poll";

export type AutopilotTriggerMode = "uk" | "texas" | "both";

type Props = {
  /** Which regional autopilot job(s) to start. */
  mode?: AutopilotTriggerMode;
  onRunStarted?: () => void;
  onRunComplete?: () => void;
  /** Called when kickoff or background job fails (resets optimistic UI). */
  onRunFailed?: () => void;
};

function buttonClassName(mode: AutopilotTriggerMode): string {
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

function watchJobInBackground(
  kickoff: AutopilotKickoffResponse,
  prefix: string,
  onProgress: (text: string) => void,
  onComplete?: () => void,
  onFailed?: () => void,
): void {
  void pollJobUntilDone(kickoff.jobId, (job) => {
    onProgress(`${prefix}: ${job.progress ?? job.status}`);
  })
    .promise.then(() => {
      onProgress(`${prefix}: complete`);
      onComplete?.();
    })
    .catch((err) => {
      onProgress(
        err instanceof Error ? err.message : `${prefix}: job failed`,
      );
      onFailed?.();
    });
}

/** Full-width mobile trigger — returns immediately; job runs in background. */
export function MobileAutopilotTrigger({
  mode = "both",
  onRunStarted,
  onRunComplete,
  onRunFailed,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const handleTrigger = async () => {
    setBusy(true);
    onRunStarted?.();

    try {
      if (mode === "uk") {
        const kickoff = await startUkAutopilotJob();
        setLabel(kickoff.message);
        watchJobInBackground(kickoff, "UK", setLabel, onRunComplete, onRunFailed);
      } else if (mode === "texas") {
        const kickoff = await startTexasAutopilotJob();
        setLabel(kickoff.message);
        watchJobInBackground(kickoff, "Texas", setLabel, onRunComplete, onRunFailed);
      } else {
        const { uk, texas } = await triggerAutopilotRuns();
        setLabel(`${uk.message} / ${texas.message}`);
        watchJobInBackground(uk, "UK", setLabel, onRunComplete, onRunFailed);
        watchJobInBackground(texas, "Texas", setLabel, onRunComplete, onRunFailed);
      }
    } catch (err) {
      setLabel(err instanceof Error ? err.message : "Autopilot failed to start");
      onRunFailed?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleTrigger()}
        className={buttonClassName(mode)}
      >
        {busy ? "Starting…" : "Trigger Autopilot Run"}
      </button>
      {label ? <p className={statusClassName(mode)}>{label}</p> : null}
    </div>
  );
}
