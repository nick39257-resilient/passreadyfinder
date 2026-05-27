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

/** Matches SQLite `date('now')` used in countSendsTodayUtc (UTC calendar day). */
export function getDailyCapResetDescription(): string {
  return "midnight UTC";
}
