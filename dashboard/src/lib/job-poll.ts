export interface JobStatus {
  id: string;
  type: string;
  status: "pending" | "running" | "done" | "failed";
  progress: string | null;
  result: unknown;
  error: string | null;
}

export async function fetchJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Job poll failed (${res.status})`);
  }
  return res.json() as Promise<JobStatus>;
}

export function pollJobUntilDone(
  jobId: string,
  onUpdate: (job: JobStatus) => void,
  intervalMs = 2500,
): { promise: Promise<JobStatus>; cancel: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const promise = new Promise<JobStatus>((resolve, reject) => {
    const tick = async () => {
      if (cancelled) {
        return;
      }
      try {
        const job = await fetchJob(jobId);
        onUpdate(job);
        if (job.status === "done") {
          if (timer) {
            clearInterval(timer);
          }
          resolve(job);
        } else if (job.status === "failed") {
          if (timer) {
            clearInterval(timer);
          }
          reject(new Error(job.error ?? "Job failed"));
        }
      } catch (err) {
        if (timer) {
          clearInterval(timer);
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void tick();
    timer = setInterval(() => void tick(), intervalMs);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    },
  };
}
