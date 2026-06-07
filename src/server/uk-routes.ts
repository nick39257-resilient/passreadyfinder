import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  countUkAutopilotQueue,
  countUkFormsSubmitted,
} from "../engine/store/leads-autopilot-repository.js";
import { countLeads } from "../engine/store/leads-repository.js";
import { createJob, getLatestJob } from "../engine/store/jobs-repository.js";
import { deferStartJob } from "./autopilot-kickoff.js";

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
      const limit =
        typeof req.body?.limit === "number" ? req.body.limit : undefined;
      const [totalLeads, queueSize] = await Promise.all([
        countLeads(),
        countUkAutopilotQueue(),
      ]);

      const jobId = await createJob("uk_autopilot", { limit: limit ?? null });
      deferStartJob(jobId, "uk_autopilot");

      let message = "Autopilot run started in background";
      if (totalLeads === 0) {
        message =
          "Autopilot started — no UK leads in database yet. Run Find in Command Center first.";
      } else if (queueSize === 0) {
        message =
          "Autopilot started in background — no leads currently need discovery (they may already have email).";
      } else {
        message = `Autopilot run started in background (${queueSize} lead(s) in discovery queue).`;
      }

      res.status(200).json({
        success: true,
        message,
        jobId,
        queueSize,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "UK autopilot failed to start",
      });
    }
  });
}
