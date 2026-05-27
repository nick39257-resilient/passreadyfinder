import { productConfig } from "../config/product.config.js";
import { countSendsTodayUtc } from "./store/sender-repository.js";

/** Single daily send cap — override with DAILY_SEND_CAP env (UTC day, per mailbox). */
export function getDailySendCapForDate(_date: Date = new Date()): number {
  const fromEnv = process.env.DAILY_SEND_CAP?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return productConfig.outreach.dailySendCap;
}

export interface DailySendQuota {
  sentToday: number;
  cap: number;
  remaining: number;
}

export async function getDailySendQuota(date: Date = new Date()): Promise<DailySendQuota> {
  const sentToday = await countSendsTodayUtc();
  const cap = getDailySendCapForDate(date);
  return {
    sentToday,
    cap,
    remaining: Math.max(0, cap - sentToday),
  };
}

/** Next UTC midnight, shown in UK local time (Europe/London, BST/GMT automatic). */
export function getDailyCapResetDescription(now: Date = new Date()): string {
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const ukTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(nextUtcMidnight));
  return `${ukTime} UK time`;
}
