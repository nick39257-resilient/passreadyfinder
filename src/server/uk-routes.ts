import type { Express, Request, Response } from "express";
import { runUkAutonomousOutreachBatch } from "../engine/uk/uk-autonomous-outreach.js";
import { runMigrations } from "../engine/store/db.js";
import { countUkFormsSubmitted } from "../engine/store/leads-autopilot-repository.js";
import { getLatestJob } from "../engine/store/jobs-repository.js";

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

export function mountUkRoutes(app: Express, requireControlAuth: ControlAuth): void {
  app.get("/api/uk/status", requireControlAuth, async (_req, res) => {
    try {
      await runMigrations();
      const latest = await getLatestJob("uk_autopilot");
      const totalFormsSubmitted = await countUkFormsSubmitted();
      const engineStatus =
        latest && (latest.status === "pending" || latest.status === "running")
          ? "Processing"
          : "Idle";
      res.json({
        metadata: {
          lastRunTimestamp: latest?.updated_at ?? null,
          engineStatus,
          totalFormsSubmitted,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load UK autopilot status" });
    }
  });

  app.post("/api/uk/jobs/autopilot", requireControlAuth, async (req, res) => {
    try {
      await runMigrations();
      const limit =
        typeof req.body?.limit === "number" ? req.body.limit : undefined;
      const summary = await runUkAutonomousOutreachBatch({ limit });
      res.json({ ok: true, summary });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "UK autopilot failed",
      });
    }
  });
}
