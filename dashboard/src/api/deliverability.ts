import { authHeaders } from "../lib/auth-headers.js";
import { getControlSecret, promptForControlSecret } from "../lib/control-auth.js";

export interface DeliverabilitySenderInfo {
  region: "uk" | "us";
  fromName: string;
  fromEmail: string;
  formattedFrom: string;
  provider: "resend";
}

export interface DeliverabilityReport {
  sendLocked: boolean;
  bounceRate: number;
  bounceThreshold: number;
  reason: string | null;
  emailEvents: {
    sent: number;
    bounce: number;
  };
  uk: {
    contacted: number;
    nurture: number;
    replied: number;
    failedDelivery: number;
    scoreClicks: number;
    clickRatePct: number | null;
    replyRatePct: number | null;
  };
  texas: {
    emailSent: number;
    formSubmitted: number;
    scoreClicks: number;
  };
  scoreClicksTotal: number;
  sender: {
    resendConfigured: boolean;
    uk: DeliverabilitySenderInfo;
    us: DeliverabilitySenderInfo;
  };
  mailTester: {
    url: string;
    steps: string[];
  };
}

export interface DeliverabilityTestSendResult {
  ok: boolean;
  to: string;
  region: "uk" | "us";
  from: string;
  subject: string;
  messageId: string;
}

export async function fetchDeliverabilityReport(): Promise<DeliverabilityReport> {
  const res = await fetch("/api/deliverability");
  if (!res.ok) {
    throw new Error(`Failed to load deliverability (${res.status})`);
  }
  return res.json() as Promise<DeliverabilityReport>;
}

export async function sendDeliverabilityTest(input: {
  to: string;
  region: "uk" | "us";
  secret?: string;
}): Promise<DeliverabilityTestSendResult> {
  const authSecret =
    input.secret ??
    promptForControlSecret("Test send needs CONTROL_PANEL_SECRET (same as Render env).");
  if (!authSecret) {
    throw new Error("CONTROL_PANEL_SECRET required — tap Key (top right) to save it.");
  }

  const res = await fetch("/api/deliverability/test-send", {
    method: "POST",
    headers: authHeaders(authSecret),
    body: JSON.stringify({ to: input.to.trim(), region: input.region }),
  });

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Test send failed (${res.status})`);
  }
  return body as DeliverabilityTestSendResult;
}
