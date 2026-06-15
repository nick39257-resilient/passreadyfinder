import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import { getPulseDashboardSnapshot } from "../engine/store/pulse-dashboard-repository.js";
import { recordPulseTrialSignup } from "../engine/store/pulse-trial-repository.js";

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

function pulseWebhookAuthorized(req: Request): boolean {
  const secret = process.env.PULSE_WEBHOOK_SECRET?.trim() || process.env.CONTROL_PANEL_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const hdr = String(req.headers.authorization ?? "");
  const bearer = hdr.toLowerCase().startsWith("bearer ") ? hdr.slice(7).trim() : "";
  const alt = String(req.headers["x-pulse-webhook"] ?? "").trim();
  return bearer === secret || alt === secret;
}

export function mountPulseRoutes(app: Express, requireControlAuth: ControlAuth): void {
  app.get("/api/pulse/dashboard", requireControlAuth, async (_req, res) => {
    try {
      await runMigrations();
      const snapshot = await getPulseDashboardSnapshot();
      res.json(snapshot);
    } catch (err) {
      console.error("[pulse/dashboard]", err);
      res.status(500).json({ error: "Failed to load pulse dashboard" });
    }
  });

  app.post("/api/pulse/trial-signup", async (req, res) => {
    try {
      if (!pulseWebhookAuthorized(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const businessName =
        typeof req.body?.businessName === "string"
          ? req.body.businessName.trim()
          : typeof req.body?.name === "string"
            ? req.body.name.trim()
            : "";
      if (!businessName) {
        res.status(400).json({ error: "businessName is required" });
        return;
      }
      await runMigrations();
      const id = await recordPulseTrialSignup({
        businessName,
        businessType:
          typeof req.body?.businessType === "string"
            ? req.body.businessType
            : typeof req.body?.business_type === "string"
              ? req.body.business_type
              : null,
        market: req.body?.market === "us" ? "us" : "uk",
        source: typeof req.body?.source === "string" ? req.body.source : null,
        email: typeof req.body?.email === "string" ? req.body.email : null,
      });
      res.json({ ok: true, id });
    } catch (err) {
      console.error("[pulse/trial-signup]", err);
      res.status(500).json({ error: "Failed to record trial signup" });
    }
  });
}
