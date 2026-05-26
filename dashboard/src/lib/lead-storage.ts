const SNOOZE_KEY = "passready_snoozed";
const DISMISS_KEY = "passready_dismissed";

type SnoozeMap = Record<string, number>;

function readSnoozed(): SnoozeMap {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}") as SnoozeMap;
  } catch {
    return {};
  }
}

function readDismissed(): Set<number> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as number[];
    return new Set(raw);
  } catch {
    return new Set();
  }
}

export function snoozeLead(leadId: number, hours = 24): void {
  const map = readSnoozed();
  map[String(leadId)] = Date.now() + hours * 60 * 60 * 1000;
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

export function dismissLead(leadId: number): void {
  const dismissed = readDismissed();
  dismissed.add(leadId);
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed]));
}

export function isLeadHidden(leadId: number): boolean {
  const dismissed = readDismissed();
  if (dismissed.has(leadId)) {
    return true;
  }
  const snoozedUntil = readSnoozed()[String(leadId)];
  return typeof snoozedUntil === "number" && snoozedUntil > Date.now();
}
