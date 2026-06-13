import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  countUkAutopilotQueue,
  countUkFormsSubmitted,
} from "../engine/store/leads-autopilot-repository.js";
import { countLeads } from "../engine/store/leads-repository.js";
import { createJob } from "../engine/store/jobs-repository.js";
import { deferStartJob } from "./autopilot-kickoff.js";
import {
  getActiveJobId,
  resolveEngineStatus,
} from "./pipeline-status.js";

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

export function mountUkRoutes(app: Express, requireControlAuth: ControlAuth): void {
  app.get("/api/uk/status", async (_req, res) => {
    try {
      await runMigrations();
      const { engineStatus, lastRunTimestamp } = await resolveEngineStatus([
        "uk_autopilot",
        "find",
      ]);
      const totalFormsSubmitted = await countUkFormsSubmitted();
      res.json({
        metadata: {
          lastRunTimestamp,
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
      const [totalLeads, queueSize] = await Promise.all([
        countLeads(),
        countUkAutopilotQueue(),
      ]);

      const jobs: Array<{ type: string; jobId: string }> = [];
      let message = "Autopilot run started in background";
      let primaryJobId: string;
      let ingestStarted = false;

      if (totalLeads === 0) {
        const activeFind = await getActiveJobId("find");
        if (activeFind) {
          res.status(200).json({
            success: true,
            message: "UK find already running in background",
            jobId: activeFind,
            queueSize,
            ingestStarted: true,
            alreadyRunning: true,
            jobs: [{ type: "find", jobId: activeFind }],
          });
          return;
        }

        const findJobId = await createJob("find", {
          area: "UK",
          worstFirst: true,
          fullResync: false,
        });
        jobs.push({ type: "find", jobId: findJobId });
        deferStartJob(findJobId, "find");
        ingestStarted = true;
        primaryJobId = findJobId;
        message =
          "No UK leads in the database — started FSA find in the background. Tap Trigger Autopilot Run again after find completes to discover websites and emails.";
      } else {
        const activeAutopilot = await getActiveJobId("uk_autopilot");
        if (activeAutopilot) {
          res.status(200).json({
            success: true,
            message: "UK autopilot already running in background",
            jobId: activeAutopilot,
            queueSize,
            ingestStarted: false,
            alreadyRunning: true,
            jobs: [{ type: "uk_autopilot", jobId: activeAutopilot }],
          });
          return;
        }

        const jobId = await createJob("uk_autopilot", { limit: limit ?? null });
        jobs.push({ type: "uk_autopilot", jobId });
        deferStartJob(jobId, "uk_autopilot");
        primaryJobId = jobId;

        if (queueSize === 0) {
          message =
            "Autopilot started in background — no leads currently need discovery (they may already have email).";
        } else {
          message = `Autopilot run started in background (${queueSize} lead(s) in discovery queue).`;
        }
      }

      res.status(200).json({
        success: true,
        message,
        jobId: primaryJobId,
        queueSize,
        ingestStarted,
        jobs,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "UK autopilot failed to start",
      });
    }
  });
}
