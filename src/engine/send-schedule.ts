import { isOutreachDayMode } from "./outreach-day-mode.js";

const UK_TIMEZONE = "Europe/London";
const SEND_HOUR_UK = 14;
/** Full hour so hourly Render cron reliably hits the window (BST/GMT). */
const SEND_WINDOW_MINUTES = 60;
const DAY_MODE_START_HOUR_UK = 7;
const DAY_MODE_END_HOUR_UK = 20;

function getUkDateParts(now: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

export function isWithinUkSendWindow(now: Date = new Date()): boolean {
  const { hour, minute } = getUkDateParts(now);
  if (isOutreachDayMode()) {
    return hour >= DAY_MODE_START_HOUR_UK && hour < DAY_MODE_END_HOUR_UK;
  }
  return hour === SEND_HOUR_UK && minute >= 0 && minute < SEND_WINDOW_MINUTES;
}

export function getUkDateKey(now: Date = new Date()): string {
  const { year, month, day } = getUkDateParts(now);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getNextUkSendWindowLabel(now: Date = new Date()): string {
  if (isOutreachDayMode()) {
    return "day mode — sends allowed 7am–8pm UK (daily cap applies)";
  }
  const current = getUkDateParts(now);
  const dayWord = current.hour < SEND_HOUR_UK ? "today" : "tomorrow";
  return `${dayWord} at 2:00 pm UK`;
}

