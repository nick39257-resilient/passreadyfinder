import { productConfig } from "../config/product.config.js";
import { getDb } from "./store/db.js";
import { runMigrations } from "./store/db.js";

export const MAX_TOUCHES = 4;

export interface DeliverabilityStatus {
  sendLocked: boolean;
  bounceRate: number;
  bounceThreshold: number;
  reason: string | null;
}

export async function getBounceRate(): Promise<number> {
  await runMigrations();
  const db = getDb();
  const windowSize = productConfig.outreach.bounceRateWindowSize;

  const result = await db.execute(`
    SELECT event_type
    FROM email_events
    WHERE event_type IN ('sent', 'bounce')
    ORDER BY created_at DESC
    LIMIT ${windowSize}
  `);

  if (result.rows.length === 0) {
    return 0;
  }

  const bounces = result.rows.filter((r) => r.event_type === "bounce").length;
  const sent = result.rows.filter((r) => r.event_type === "sent").length;
  const denominator = sent + bounces;
  if (denominator === 0) {
    return 0;
  }
  return bounces / denominator;
}

export async function isSendLocked(): Promise<boolean> {
  const rate = await getBounceRate();
  return rate > productConfig.outreach.bounceRatePauseThreshold;
}

export async function getDeliverabilityStatus(): Promise<DeliverabilityStatus> {
  const bounceRate = await getBounceRate();
  const bounceThreshold = productConfig.outreach.bounceRatePauseThreshold;
  const sendLocked = bounceRate > bounceThreshold;

  return {
    sendLocked,
    bounceRate,
    bounceThreshold,
    reason: sendLocked
      ? `Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds ${(bounceThreshold * 100).toFixed(0)}% limit`
      : null,
  };
}

export function randomSendDelayMs(): number {
  const minMs = productConfig.outreach.sendDelayMinMs;
  const maxMs = productConfig.outreach.sendDelayMaxMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function formatDelayMinutes(ms: number): string {
  return `${Math.round(ms / 60000)} min`;
}
