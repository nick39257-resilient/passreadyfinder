import { runFindPipeline } from "../engine/pipeline.js";
import { runDrafter } from "../engine/drafter.js";
import { runSender } from "../engine/sender.js";
import {
  getJob,
  updateJob,
  type JobType,
} from "../engine/store/jobs-repository.js";
import type { DraftJobParams, FindJobParams } from "../types/segmentation.js";

async function runJobBody(
  jobId: string,
  type: JobType,
): Promise<unknown> {
  const job = await getJob(jobId);
  let params: unknown = null;
  if (job?.params) {
    try {
      params = JSON.parse(job.params);
    } catch {
      params = null;
    }
  }

  const onProgress = async (message: string) => {
    await updateJob(jobId, { progress: message });
  };

  switch (type) {
    case "find": {
      await updateJob(jobId, {
        status: "running",
        progress: "Finding FSA leads and enriching via OSM…",
      });
      return runFindPipeline({
        segmentation: params as FindJobParams | undefined,
      });
    }
    case "draft": {
      await updateJob(jobId, {
        status: "running",
        progress: "Drafting messages with Gemini (may take several minutes)…",
      });
      return runDrafter(params as DraftJobParams | undefined);
    }
    case "send": {
      await updateJob(jobId, {
        status: "running",
        progress: "Sending approved emails via Resend…",
      });
      return runSender(onProgress);
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
