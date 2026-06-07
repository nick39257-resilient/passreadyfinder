import type { JobType } from "../engine/store/jobs-repository.js";
import { startJob } from "./job-runner.js";

/** Start a job after the HTTP response has been flushed (avoids gateway timeouts). */
export function deferStartJob(jobId: string, type: JobType): void {
  setImmediate(() => {
    startJob(jobId, type);
  });
}

export type AutopilotKickoffPayload = {
  success: true;
  message: string;
  jobId: string;
  queueSize?: number;
  ingestStarted?: boolean;
  jobs?: Array<{ type: string; jobId: string }>;
};
