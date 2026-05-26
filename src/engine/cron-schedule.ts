import { productConfig } from "../config/product.config.js";

export interface CronWindowConfig {
  earliestHourUtc: number;
  latestHourUtc: number;
  runBucketMinutes: number;
}

/** Deterministic hash for daily cron slot selection (UTC date + job id). */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today's one-off run time for a scheduled job (UTC). Minute is never :00 — e.g. 09:12, 10:45, 14:20.
 */
export function getCronWindowForJob(jobId: string): CronWindowConfig {
  if (jobId === "find-leads") {
    return productConfig.outreach.finderCron;
  }
  return productConfig.outreach.cronSchedule;
}

export function getTodayJobSlotUtc(
  jobId: string,
  date: Date = new Date(),
): { hour: number; minute: number } {
  const cfg = getCronWindowForJob(jobId);
  const salt = process.env.CRON_SCHEDULE_SALT?.trim() ?? "passready";
  const seed = hashSeed(`${jobId}:${formatUtcDate(date)}:${salt}`);
  const hourSpan = cfg.latestHourUtc - cfg.earliestHourUtc + 1;
  const hour = cfg.earliestHourUtc + (seed % hourSpan);
  const minute = 1 + (Math.floor(seed / hourSpan) % 59);
  return { hour, minute };
}

export function formatJobSlotUtc(slot: { hour: number; minute: number }): string {
  const hh = String(slot.hour).padStart(2, "0");
  const mm = String(slot.minute).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

/**
 * True when the current time is in the same 5-minute bucket as today's scheduled slot.
 * Pair with Render cron schedule: every 5 minutes.
 */
export function shouldRunScheduledJob(jobId: string, now: Date = new Date()): boolean {
  const slot = getTodayJobSlotUtc(jobId, now);
  const slotMinutes = slot.hour * 60 + slot.minute;
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const bucketMinutes = getCronWindowForJob(jobId).runBucketMinutes;
  return Math.floor(nowMinutes / bucketMinutes) === Math.floor(slotMinutes / bucketMinutes);
}

/** Finder: once per UTC day at a pseudo-random time (hourly cron + bucket match). */
export function shouldRunFinderCron(now: Date = new Date()): boolean {
  return shouldRunScheduledJob("find-leads", now);
}
