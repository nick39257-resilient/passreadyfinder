import { readSession, writeSession } from "./safe-storage";

const STORAGE_KEY = "control_secret";

export function getControlSecret(): string {
  return readSession(STORAGE_KEY) ?? "";
}

export function setControlSecret(secret: string): void {
  writeSession(STORAGE_KEY, secret.trim());
}

/** Prompt once if server requires CONTROL_PANEL_SECRET (Render production). */
export function ensureControlSecret(existing?: string): string {
  const current = (existing ?? getControlSecret()).trim();
  if (current) {
    return current;
  }

  const entered = window.prompt(
    "This action needs your Control Panel secret.\n\nPaste CONTROL_PANEL_SECRET from Render (or leave blank to cancel):",
  );
  if (!entered?.trim()) {
    throw new Error("Control panel secret required — add it in Render env or enter when prompted.");
  }

  setControlSecret(entered);
  return entered.trim();
}
