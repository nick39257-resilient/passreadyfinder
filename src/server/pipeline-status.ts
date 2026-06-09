import {
  getLatestJob,
  type JobRecord,
  type JobType,
} from "../engine/store/jobs-repository.js";

export function isJobActive(job: JobRecord | null | undefined): boolean {
  return Boolean(job && (job.status === "pending" || job.status === "running"));
}

export async function resolveEngineStatus(types: JobType[]): Promise<{
  engineStatus: "Idle" | "Processing";
  lastRunTimestamp: string | null;
}> {
  let lastRunTimestamp: string | null = null;

  for (const type of types) {
    const latest = await getLatestJob(type);
    if (isJobActive(latest)) {
      return {
        engineStatus: "Processing",
        lastRunTimestamp: latest!.updated_at,
      };
    }
    if (
      latest?.updated_at &&
      (!lastRunTimestamp || latest.updated_at > lastRunTimestamp)
    ) {
      lastRunTimestamp = latest.updated_at;
    }
  }

  return { engineStatus: "Idle", lastRunTimestamp };
}

export async function getActiveJobId(type: JobType): Promise<string | null> {
  const latest = await getLatestJob(type);
  return isJobActive(latest) ? latest!.id : null;
}
