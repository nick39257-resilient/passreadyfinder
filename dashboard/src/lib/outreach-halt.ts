/** Mirror server halted statuses — keep in sync with src/engine/outreach-halt.ts */
export const OUTREACH_HALTED_STATUSES = [
  "suppressed",
  "replied",
  "opted_in",
  "trial_started",
  "nurture",
] as const;

export function isOutreachHaltedStatus(status: string): boolean {
  return (OUTREACH_HALTED_STATUSES as readonly string[]).includes(status);
}
