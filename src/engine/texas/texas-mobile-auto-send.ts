import { isCopilotOutreachMode } from "../outreach-strategy.js";
import { texasProductConfig } from "../../config/product.texas.config.js";
import {
  TEXAS_STATUS_EMAIL_SENT,
  TEXAS_STATUS_FORM_SUBMITTED,
} from "../../types/texas.js";
import { isValidOutreachEmail } from "../outreach-email.js";
import { getTexasLeadById } from "../store/texas-leads-repository.js";
import { executeTexasLeadOutreach } from "./texas-outreach-executor.js";

/** Auto-email Texas mobile vendors when an address is on file (default on). */
export function texasMobileAutoSendEnabled(): boolean {
  if (isCopilotOutreachMode()) {
    return false;
  }
  const raw = process.env.TEXAS_MOBILE_AUTO_SEND?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") {
    return false;
  }
  return true;
}

export type TexasMobileAutoSendResult =
  | { sent: true; channel: "email" | "contact_form" }
  | { sent: false; reason: string };

/**
 * Send the HB 2844 mobile outreach email when a Texas mobile lead has a mailable address.
 * No-op when auto-send is disabled, lead is not mobile, or outreach already completed.
 */
export async function tryAutoSendTexasMobileOutreach(
  leadId: number,
): Promise<TexasMobileAutoSendResult> {
  if (!texasMobileAutoSendEnabled()) {
    return { sent: false, reason: "auto_send_disabled" };
  }

  const row = await getTexasLeadById(leadId);
  if (!row) {
    return { sent: false, reason: "lead_not_found" };
  }
  if (row.is_mobile_vendor !== 1) {
    return { sent: false, reason: "not_mobile_vendor" };
  }
  if (row.status === TEXAS_STATUS_EMAIL_SENT || row.status === TEXAS_STATUS_FORM_SUBMITTED) {
    return { sent: false, reason: "already_contacted" };
  }
  if (!isValidOutreachEmail(row.email)) {
    return { sent: false, reason: "no_valid_email" };
  }

  try {
    const result = await executeTexasLeadOutreach(leadId);
    return { sent: true, channel: result.channel };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Texas mobile auto-send skipped for lead ${leadId} (${row.business_name}): ${message}`,
    );
    return { sent: false, reason: message };
  }
}

export function texasMobileProductLabel(): string {
  return `${texasProductConfig.outreach.productName} US mobile module`;
}
