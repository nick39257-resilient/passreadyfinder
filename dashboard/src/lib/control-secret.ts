import { readSession, writeSession } from "./safe-storage";

const STORAGE_KEY = "control_secret";

export function getControlSecret(): string {
  return readSession(STORAGE_KEY) ?? "";
}

export function setControlSecret(secret: string): void {
  writeSession(STORAGE_KEY, secret.trim());
}

/** Control panel auth disabled — no prompt. */
export function ensureControlSecret(_existing?: string): string {
  return getControlSecret().trim();
}
