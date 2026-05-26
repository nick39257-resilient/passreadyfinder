import type { JobRecord, JobType } from "../store/jobs-repository.js";
import { getRecentJobs } from "../store/jobs-repository.js";

export interface ActivityTickerItem {
  id: string;
  message: string;
  status: string;
  updatedAt: string;
}

function labelForJobType(type: JobType): string {
  switch (type) {
    case "find":
      return "FindLeads: scraping & scoring";
    case "draft":
      return "QueueDrafter: drafting batch";
    case "send":
      return "Sending approved messages";
    default:
      return "Running pipeline";
  }
}

function formatActivityMessage(job: JobRecord): string {
  const base = labelForJobType(job.type);
  if (job.status === "running" && job.progress) {
    return `${base}… ${job.progress}`;
  }
  if (job.status === "done") {
    return `${base} — complete`;
  }
  if (job.status === "failed") {
    return `${base} — failed`;
  }
  if (job.status === "pending") {
    return `${base} — queued`;
  }
  return base;
}

export async function getSystemActivity(limit = 6): Promise<ActivityTickerItem[]> {
  const jobs = await getRecentJobs(limit);
  return jobs.map((job) => ({
    id: job.id,
    message: formatActivityMessage(job),
    status: job.status,
    updatedAt: job.updated_at,
  }));
}
