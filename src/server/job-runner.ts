import { runFindLeadsJob } from "../engine/find-leads-job.js";
import { runQueueDrafter } from "../engine/queue-drafter.js";
import { runSender } from "../engine/sender.js";
import { runAutoDraftAll } from "../engine/auto-draft-all.js";
import { quickDraftLeadById } from "./quick-draft-handler.js";
import { runContactDiscoveryForLead } from "../engine/contact-discovery/discover.js";
import { appendEngineLog } from "../engine/store/engine-log-repository.js";
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
      const findParams = params as FindJobParams | undefined;
      await updateJob(jobId, {
        status: "running",
        progress: findParams?.fullResync
          ? "Full FSA rescan (all matching takeaways)…"
          : "Checking FSA for rating changes since last sync…",
      });
      return runFindLeadsJob({
        segmentation: findParams,
      });
    }
    case "draft": {
      await updateJob(jobId, {
        status: "running",
        progress: "QueueDrafter batch (ConsultantTip + Gemini)…",
      });
      return runQueueDrafter({
        batchSize: (params as DraftJobParams | undefined)?.batchSize,
      });
    }
    case "draft_all": {
      await updateJob(jobId, {
        status: "running",
        progress: "Auto-drafting all eligible takeaways…",
      });
      return runAutoDraftAll(onProgress);
    }
    case "send": {
      await updateJob(jobId, {
        status: "running",
        progress: "Sending approved emails via Resend…",
      });
      return runSender(onProgress);
    }
    case "quick_draft": {
      const leadId = Number((params as { leadId?: number } | null)?.leadId);
      if (!Number.isInteger(leadId) || leadId < 1) {
        throw new Error("Invalid lead id for quick draft job");
      }
      await updateJob(jobId, {
        status: "running",
        progress: "Quick draft (ConsultantTip + Gemini)…",
      });
      const result = await quickDraftLeadById(leadId);
      return result;
    }
    case "contact_discovery": {
      const leadId = Number((params as { leadId?: number } | null)?.leadId);
      if (!Number.isInteger(leadId) || leadId < 1) {
        throw new Error("Invalid lead id for contact discovery job");
      }
      const discovery = await runContactDiscoveryForLead(leadId, async (message) => {
        await updateJob(jobId, { progress: message });
      });
      return { leadId, contactScore: discovery.contactScore };
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown job type: ${_exhaustive}`);
    }
  }
}

async function logSendJobOutcome(result: unknown): Promise<void> {
  const r = result as { sent?: number } | null;
  const sent = r?.sent;
  if (typeof sent === "number" && sent > 0) {
    await appendEngineLog({
      source: "send",
      message: `Sent ${sent} message${sent === 1 ? "" : "s"}`,
      level: "info",
    });
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
      if (type === "send") {
        await logSendJobOutcome(result);
      }
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
