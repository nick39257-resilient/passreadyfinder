import { runFindPipeline } from "../engine/pipeline.js";
import { runDrafter } from "../engine/drafter.js";
import { runSender } from "../engine/sender.js";
import {
  updateJob,
  type JobType,
} from "../engine/store/jobs-repository.js";

async function runJobBody(
  jobId: string,
  type: JobType,
): Promise<unknown> {
  switch (type) {
    case "find": {
      await updateJob(jobId, {
        status: "running",
        progress: "Finding FSA leads and enriching via OSM…",
      });
      return runFindPipeline();
    }
    case "draft": {
      await updateJob(jobId, {
        status: "running",
        progress: "Drafting messages with Gemini (may take several minutes)…",
      });
      return runDrafter();
    }
    case "send": {
      await updateJob(jobId, {
        status: "running",
        progress: "Sending approved emails via Resend…",
      });
      return runSender();
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown job type: ${_exhaustive}`);
    }
  }
}

/** Fire-and-forget background job on the always-on server. */
export function startJob(jobId: string, type: JobType): void {
  void (async () => {
    try {
      const result = await runJobBody(jobId, type);
      await updateJob(jobId, {
        status: "done",
        progress: "Complete",
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Job ${jobId} (${type}) failed:`, err);
      await updateJob(jobId, {
        status: "failed",
        progress: "Failed",
        error: message,
      });
    }
  })();
}
