import type { Request, Response } from "express";
import { Resend } from "resend";
import { parseInboundFromAddress } from "../engine/inbound-email.js";
import { findLeadIdByBusinessEmail } from "../engine/store/leads-repository.js";
import { stopSequenceForReply } from "../engine/outreach-halt.js";

export async function handleResendInboundWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: "RESEND_WEBHOOK_SECRET not configured" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: "RESEND_API_KEY not configured" });
    return;
  }

  const payload =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : "";

  if (!payload) {
    res.status(400).json({ error: "Empty body" });
    return;
  }

  const id = req.headers["svix-id"];
  const timestamp = req.headers["svix-timestamp"];
  const signature = req.headers["svix-signature"];
  if (
    typeof id !== "string" ||
    typeof timestamp !== "string" ||
    typeof signature !== "string"
  ) {
    res.status(400).json({ error: "Missing Svix headers" });
    return;
  }

  const resend = new Resend(apiKey);
  let event: { type?: string; data?: Record<string, unknown> };
  try {
    const verified = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
    event = verified as unknown as { type?: string; data?: Record<string, unknown> };
  } catch (err) {
    console.error("[resend-webhook] verify failed", err);
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  if (event.type !== "email.received") {
    res.status(200).json({ ok: true, ignored: event.type ?? "unknown" });
    return;
  }

  const fromRaw =
    typeof event.data?.from === "string"
      ? event.data.from
      : typeof event.data?.from_email === "string"
        ? event.data.from_email
        : "";
  const fromEmail = parseInboundFromAddress(fromRaw);
  if (!fromEmail) {
    res.status(200).json({ ok: true, matched: false, reason: "no_from_email" });
    return;
  }

  const leadId = await findLeadIdByBusinessEmail(fromEmail);
  if (leadId == null) {
    console.log(`[resend-webhook] no lead for ${fromEmail}`);
    res.status(200).json({ ok: true, matched: false, from: fromEmail });
    return;
  }

  await stopSequenceForReply(leadId);
  console.log(`[resend-webhook] marked lead ${leadId} replied (${fromEmail})`);
  res.status(200).json({ ok: true, matched: true, leadId, from: fromEmail });
}
