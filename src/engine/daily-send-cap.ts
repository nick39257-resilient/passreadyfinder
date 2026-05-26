import { productConfig } from "../config/product.config.js";
import { countSendsTodayUtc } from "./store/sender-repository.js";

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic daily cap between min and max (per mailbox, UTC day). */
export function getDailySendCapForDate(date: Date = new Date()): number {
  const { dailySendCapMin, dailySendCapMax } = productConfig.outreach;
  const dayKey = date.toISOString().slice(0, 10);
  const span = dailySendCapMax - dailySendCapMin + 1;
  const offset = hashSeed(`send-cap:${dayKey}`) % span;
  return dailySendCapMin + offset;
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
