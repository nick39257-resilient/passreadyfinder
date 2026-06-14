import { isOutreachDayMode } from "./outreach-day-mode.js";

/** Human-assisted outreach: warm leads, WA/call queue, no cold email spray. */
export function isCopilotOutreachMode(): boolean {
  const raw = process.env.OUTREACH_COPILOT_MODE?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  // Default on — replaces cold email automation.
  return true;
}

/** Only auto-send email to score visitors or leads who already replied. */
export function isWarmOnlyEmailEnabled(): boolean {
  if (!isCopilotOutreachMode()) {
    return false;
  }
  const raw = process.env.OUTREACH_WARM_ONLY?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return true;
}

/** Cron / day-pipeline may send email without manual action. */
export function isEmailAutosendEnabled(): boolean {
  const explicit = process.env.OUTREACH_EMAIL_AUTOSEND?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") {
    return true;
  }
  if (explicit === "false" || explicit === "0" || explicit === "no") {
    return false;
  }
  if (isCopilotOutreachMode()) {
    return false;
  }
  return isOutreachDayMode();
}

export function copilotWhatsAppDailyCap(): number {
  const fromEnv = Number(process.env.COPILOT_WHATSAPP_DAILY_CAP);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(fromEnv, 50);
  }
  return 20;
}

export function copilotDigestSize(): number {
  const fromEnv = Number(process.env.COPILOT_DIGEST_SIZE);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(fromEnv, 25);
  }
  return 10;
}

/** First-touch WhatsApp copy — no links, one short question. */
export function copilotWhatsAppOpener(businessName: string): string {
  const custom = process.env.COPILOT_WHATSAPP_OPENER?.trim();
  const name = businessName.trim() || "your kitchen";
  if (custom) {
    return custom.replace(/\{\{businessName\}\}/gi, name).replace(/\[Business Name\]/gi, name);
  }
  return `Hi — quick one about ${name}. We built a free checklist kitchens use before council spot checks. Worth sending over?`;
}
