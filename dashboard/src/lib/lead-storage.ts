import { readLocal, writeLocal } from "./safe-storage";

const SNOOZE_KEY = "passready_snoozed";
const DISMISS_KEY = "passready_dismissed";

type SnoozeMap = Record<string, number>;

function readSnoozed(): SnoozeMap {
  try {
    return JSON.parse(readLocal(SNOOZE_KEY) ?? "{}") as SnoozeMap;
  } catch {
    return {};
  }
}

function readDismissed(): Set<number> {
  try {
    const raw = JSON.parse(readLocal(DISMISS_KEY) ?? "[]") as number[];
    return new Set(raw);
  } catch {
    return new Set();
  }
}

export function snoozeLead(leadId: number, hours = 24 * 30): void {
  const map = readSnoozed();
  map[String(leadId)] = Date.now() + hours * 60 * 60 * 1000;
  writeLocal(SNOOZE_KEY, JSON.stringify(map));
}

export function dismissLead(leadId: number): void {
  const dismissed = readDismissed();
  dismissed.add(leadId);
  writeLocal(DISMISS_KEY, JSON.stringify([...dismissed]));
}

export function isLeadHidden(leadId: number): boolean {
  const dismissed = readDismissed();
  if (dismissed.has(leadId)) {
    return true;
  }
  const snoozedUntil = readSnoozed()[String(leadId)];
  return typeof snoozedUntil === "number" && snoozedUntil > Date.now();
}
