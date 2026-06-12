import { getSetting, setSetting } from "./store/outreach-migrations.js";

const LOCK_KEY = "outbound_send_lock";
const DEFAULT_LOCK_TTL_MS = 4 * 60 * 60 * 1000;

function lockTtlMs(): number {
  const fromEnv = Number(process.env.OUTBOUND_SEND_LOCK_TTL_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 60_000) {
    return fromEnv;
  }
  return DEFAULT_LOCK_TTL_MS;
}

/** Cross-process mutex for UK outbound SMTP batches (HTTP job + send-cron). */
export async function tryAcquireOutboundSendLock(): Promise<boolean> {
  const raw = await getSetting(LOCK_KEY);
  if (raw?.trim()) {
    const lockedAt = new Date(raw).getTime();
    if (!Number.isNaN(lockedAt) && Date.now() - lockedAt < lockTtlMs()) {
      return false;
    }
  }
  await setSetting(LOCK_KEY, new Date().toISOString());
  return true;
}

export async function releaseOutboundSendLock(): Promise<void> {
  await setSetting(LOCK_KEY, "");
}
