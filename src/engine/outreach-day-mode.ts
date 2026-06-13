/** Aggressive outreach settings for unattended runs (Render OUTREACH_DAY_MODE=true). */
export function isOutreachDayMode(): boolean {
  const raw = process.env.OUTREACH_DAY_MODE?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function texasAutopilotContactFormsEnabled(): boolean {
  if (isOutreachDayMode()) {
    return false;
  }
  const raw = process.env.TEXAS_AUTOPILOT_CONTACT_FORMS?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  return true;
}

export function outreachMobileSignatureEnabled(): boolean {
  const raw = process.env.OUTREACH_MOBILE_SIGNATURE?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (isOutreachDayMode()) {
    return false;
  }
  return true;
}
