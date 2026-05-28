import { readSession, writeSession } from "./safe-storage";

const STORAGE_SECRET = "control_secret";

export function getControlSecret(): string {
  return readSession(STORAGE_SECRET)?.trim() ?? "";
}

export function setControlSecret(secret: string): void {
  writeSession(STORAGE_SECRET, secret.trim());
}

/** Prompt once; returns secret or null if cancelled. */
export function promptForControlSecret(reason?: string): string | null {
  const existing = getControlSecret();
  if (existing) {
    return existing;
  }
  const msg =
    reason ??
    "This action needs your CONTROL_PANEL_SECRET (same as Render env var).";
  const entered = window.prompt(msg);
  if (!entered?.trim()) {
    return null;
  }
  setControlSecret(entered.trim());
  return entered.trim();
}
