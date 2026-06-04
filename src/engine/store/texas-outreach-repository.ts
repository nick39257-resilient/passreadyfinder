import { getDb } from "./db.js";
import {
  HB2844_MOBILE_PITCH_TEMPLATE,
  buildHb2844MobileOutreachMessage,
} from "../texas/hb2844.js";

export const HB2844_TEMPLATE_ID = "hb2844_mobile_july_2026";

export async function upsertHb2844MobileTemplate(): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO texas_outreach_templates (id, region, audience, subject, body_template)
      VALUES (?, 'TEXAS', 'mobile_vendor_hb2844', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        body_template = excluded.body_template,
        subject = excluded.subject
    `,
    args: [
      HB2844_TEMPLATE_ID,
      "HB 2844 — Texas mobile unit outreach (July 2026)",
      HB2844_MOBILE_PITCH_TEMPLATE,
    ],
  });
}

export async function getHb2844MobileTemplateBody(): Promise<string> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT body_template FROM texas_outreach_templates WHERE id = ?`,
    args: [HB2844_TEMPLATE_ID],
  });
  const body = result.rows[0]?.body_template;
  return typeof body === "string" && body.trim()
    ? body.trim()
    : HB2844_MOBILE_PITCH_TEMPLATE;
}

export function renderHb2844DraftForLead(input: {
  ownerName: string | null;
  businessName: string;
}): string {
  return buildHb2844MobileOutreachMessage({
    ownerName: input.ownerName?.trim() || "there",
    businessName: input.businessName,
  });
}
