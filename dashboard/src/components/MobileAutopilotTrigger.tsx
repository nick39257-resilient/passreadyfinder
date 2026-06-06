import { useState } from "react";
import { triggerAutopilotRuns } from "../api/autopilot-trigger";
import { ensureControlSecret, getControlSecret } from "../lib/control-secret";
import { pollJobUntilDone } from "../lib/job-poll";

type Props = {
  onRunStarted?: () => void;
  onRunComplete?: () => void;
};

/** Full-width mobile trigger — visible only when control secret is saved. */
export function MobileAutopilotTrigger({ onRunStarted, onRunComplete }: Props) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const isAuthenticated = Boolean(getControlSecret()?.trim());

  if (!isAuthenticated) {
    return null;
  }

  const handleTrigger = async () => {
    setBusy(true);
    setLabel("Starting UK + Texas autopilot…");
    onRunStarted?.();
    try {
      const secret = ensureControlSecret(getControlSecret());
      const { ukJobId, texasJobId } = await triggerAutopilotRuns(secret);
      setLabel("Autopilot running in background…");

      const { promise: ukPromise } = pollJobUntilDone(ukJobId, (job) => {
        setLabel(`UK: ${job.progress ?? job.status}`);
      });
      const { promise: texasPromise } = pollJobUntilDone(texasJobId, (job) => {
        setLabel(`Texas: ${job.progress ?? job.status}`);
      });

      await Promise.allSettled([ukPromise, texasPromise]);
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
        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 disabled:opacity-60"
      >
        {busy ? "Autopilot running…" : "Trigger Autopilot Run"}
      </button>
      {label ? (
        <p className="mt-2 text-center text-xs text-emerald-200/90">{label}</p>
      ) : null}
    </div>
  );
}
