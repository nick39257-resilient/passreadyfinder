import { runFindLeadsJob } from "../engine/find-leads-job.js";
import { runFindTexasLeadsJob } from "../engine/find-texas-leads-job.js";
import { runTexasTierResyncJob } from "../engine/find-texas-tier-resync-job.js";
import { runTexasAutonomousOutreachBatch } from "../engine/texas/texas-autonomous-outreach.js";
import { runUkAutonomousOutreachBatch } from "../engine/uk/uk-autonomous-outreach.js";
import type { TexasFindJobParams } from "../types/texas.js";
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
import { OperationTimeoutError, withTimeout } from "../engine/services/service-timeout.js";

const JOB_TIMEOUT_MS: Partial<Record<JobType, number>> = {
  find: 2 * 60 * 60 * 1000,
  find_texas: 45 * 60 * 1000,
  texas_reclassify: 15 * 60 * 1000,
  texas_autopilot: 55 * 60 * 1000,
  uk_autopilot: 55 * 60 * 1000,
  draft_all: 60 * 60 * 1000,
  contact_discovery: 20 * 60 * 1000,
};

const DEFAULT_JOB_TIMEOUT_MS = 60 * 60 * 1000;

function jobTimeoutMs(type: JobType): number {
  return JOB_TIMEOUT_MS[type] ?? DEFAULT_JOB_TIMEOUT_MS;
}

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
        jobId,
        segmentation: findParams,
        onProgress: async (message) => {
          await updateJob(jobId, { progress: message });
        },
      });
    }
    case "find_texas": {
      const texasParams = params as TexasFindJobParams | undefined;
      await updateJob(jobId, {
        status: "running",
        progress: texasParams?.mobileOnly
          ? "Ingesting Texas mobile food units (open data)…"
          : "Ingesting Texas health inspection open data…",
      });
      return runFindTexasLeadsJob({ segmentation: texasParams });
    }
    case "texas_reclassify": {
      await updateJob(jobId, {
        status: "running",
        progress: "HB 2844: classifying mobile vendor tiers…",
      });
      return runTexasTierResyncJob();
    }
    case "texas_autopilot": {
      const limit = Number((params as { limit?: number | null } | null)?.limit);
      await updateJob(jobId, {
        status: "running",
        progress: "Texas autopilot: website discovery + forms…",
      });
      return runTexasAutonomousOutreachBatch({
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      });
    }
    case "uk_autopilot": {
      const limit = Number((params as { limit?: number | null } | null)?.limit);
      await updateJob(jobId, {
        status: "running",
        progress: "UK autopilot: OSM/DDG discovery + forms…",
      });
      return runUkAutonomousOutreachBatch({
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
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
        progress: "Sending approved emails via Private Email SMTP…",
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

async function ensureJobNotStuckInFlight(
  jobId: string,
  fallbackError: string,
): Promise<void> {
  const job = await getJob(jobId);
  if (job?.status === "running" || job?.status === "pending") {
    await updateJob(jobId, {
      status: "failed",
      progress: "Failed",
      error: fallbackError,
    });
  }
}

/** Fire-and-forget background job on the always-on server. */
export function startJob(jobId: string, type: JobType): void {
  void (async () => {
    try {
      await updateJob(jobId, { status: "running", progress: "Starting…" });
      const result = await withTimeout(
        jobTimeoutMs(type),
        `job_${type}`,
        () => runJobBody(jobId, type),
      );
      await updateJob(jobId, {
        status: "done",
        progress: "Complete",
        result,
      });
      if (type === "send") {
        await logSendJobOutcome(result);
        try {
          const { runLeadTriage } = await import("../engine/lead-triage.js");
          await runLeadTriage();
        } catch (triageErr) {
          console.warn(
            "Post-send triage failed:",
            triageErr instanceof Error ? triageErr.message : triageErr,
          );
        }
      }
    } catch (err) {
      const message =
        err instanceof OperationTimeoutError
          ? `Job timed out after ${jobTimeoutMs(type) / 1000}s`
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`Job ${jobId} (${type}) failed:`, err);
      await updateJob(jobId, {
        status: "failed",
        progress: "Failed",
        error: message,
      });
    } finally {
      await ensureJobNotStuckInFlight(
        jobId,
        "Job ended without completion — pulse reset to idle",
      );
    }
  })();
}
