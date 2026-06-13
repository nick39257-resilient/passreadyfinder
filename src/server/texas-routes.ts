import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  countTexasAutopilotQueue,
  countTexasFormsSubmitted,
  countTexasLeads,
  getAllTexasLeads,
  getTexasLeadById,
  refreshTexasLeadOutreachDraft,
  type TexasLeadSegment,
} from "../engine/store/texas-leads-repository.js";
import { runTexasApolloEnrichmentBatch } from "../engine/texas/texas-enrichment-service.js";
import { executeTexasLeadOutreach } from "../engine/texas/texas-outreach-executor.js";
import { mapTexasLeadRowToApi } from "./texas-api-mapper.js";
import { createJob } from "../engine/store/jobs-repository.js";
import { deferStartJob } from "./autopilot-kickoff.js";
import {
  getActiveJobId,
  resolveEngineStatus,
} from "./pipeline-status.js";
import type { TexasFindJobParams } from "../types/texas.js";

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

function parseTexasLeadSegment(query: Request["query"]): TexasLeadSegment {
  const raw = typeof query.segment === "string" ? query.segment.trim() : "";
  if (raw === "hasEmail" || raw === "ready") {
    return "hasEmail";
  }
  if (raw === "mobile") {
    return "mobile";
  }
  if (query.mobileOnly === "1" || query.mobileOnly === "true") {
    return "mobile";
  }
  return "all";
}

export function mountTexasRoutes(
  app: Express,
  requireControlAuth: ControlAuth,
): void {
  app.get("/api/texas/status", async (_req, res) => {
    try {
      await runMigrations();
      const { engineStatus, lastRunTimestamp } = await resolveEngineStatus([
        "texas_autopilot",
        "find_texas",
      ]);
      const totalFormsSubmitted = await countTexasFormsSubmitted();
      res.json({
        metadata: {
          lastRunTimestamp,
          engineStatus,
          totalFormsSubmitted,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load Texas autopilot status" });
    }
  });

  app.get("/api/texas/stats", async (_req, res) => {
    try {
      await runMigrations();
      const counts = await countTexasLeads();
      res.json({ region: "TEXAS", ...counts });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load Texas stats" });
    }
  });

  app.get("/api/texas/leads", async (req, res) => {
    try {
      await runMigrations();
      const segment = parseTexasLeadSegment(req.query);
      const rows = await getAllTexasLeads({ segment });
      res.json({ leads: rows.map(mapTexasLeadRowToApi), segment });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load Texas leads" });
    }
  });

  app.get("/api/texas/leads/:id", async (req, res) => {
    try {
      await runMigrations();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Invalid lead id" });
        return;
      }
      const row = await getTexasLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Texas lead not found" });
        return;
      }
      res.json(mapTexasLeadRowToApi(row));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load Texas lead" });
    }
  });

  app.post("/api/texas/leads/:id/refresh-draft", requireControlAuth, async (req, res) => {
    try {
      await runMigrations();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Invalid lead id" });
        return;
      }
      const ok = await refreshTexasLeadOutreachDraft(id);
      if (!ok) {
        res.status(400).json({ error: "Could not refresh draft for this lead" });
        return;
      }
      const row = await getTexasLeadById(id);
      res.json({ ok: true, lead: row ? mapTexasLeadRowToApi(row) : null });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to refresh Texas outreach draft" });
    }
  });

  app.post("/api/texas/leads/:id/send-outreach", requireControlAuth, async (req, res) => {
    try {
      await runMigrations();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Invalid lead id" });
        return;
      }
      const result = await executeTexasLeadOutreach(id);
      const row = await getTexasLeadById(id);
      res.json({
        ok: true,
        result,
        lead: row ? mapTexasLeadRowToApi(row) : null,
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Texas outreach failed";
      const status =
        message.includes("not found") || message.includes("already completed")
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/texas/jobs/autopilot", requireControlAuth, async (req, res) => {
    try {
      await runMigrations();
      const limit =
        typeof req.body?.limit === "number" ? req.body.limit : undefined;
      const source =
        typeof req.body?.source === "string" ? req.body.source : "austin";
      const [counts, queueSize] = await Promise.all([
        countTexasLeads(),
        countTexasAutopilotQueue(),
      ]);

      const jobs: Array<{ type: string; jobId: string }> = [];
      let message = "Autopilot run started in background";
      let primaryJobId: string;
      let ingestStarted = false;

      if (counts.total === 0) {
        const activeFind = await getActiveJobId("find_texas");
        if (activeFind) {
          res.status(200).json({
            success: true,
            message: "Texas ingest already running in background",
            jobId: activeFind,
            queueSize,
            ingestStarted: true,
            alreadyRunning: true,
            jobs: [{ type: "find_texas", jobId: activeFind }],
          });
          return;
        }

        const findJobId = await createJob("find_texas", {
          limit: limit ?? 500,
          source,
        });
        jobs.push({ type: "find_texas", jobId: findJobId });
        deferStartJob(findJobId, "find_texas");
        ingestStarted = true;
        primaryJobId = findJobId;
        message =
          "No Texas records in the database — started open-data ingest in the background. Tap Trigger Autopilot Run again after ingest completes to discover websites and emails.";
      } else {
        const activeAutopilot = await getActiveJobId("texas_autopilot");
        if (activeAutopilot) {
          res.status(200).json({
            success: true,
            message: "Texas autopilot already running in background",
            jobId: activeAutopilot,
            queueSize,
            ingestStarted: false,
            alreadyRunning: true,
            jobs: [{ type: "texas_autopilot", jobId: activeAutopilot }],
          });
          return;
        }

        const jobId = await createJob("texas_autopilot", { limit: limit ?? null });
        jobs.push({ type: "texas_autopilot", jobId });
        deferStartJob(jobId, "texas_autopilot");
        primaryJobId = jobId;

        if (queueSize === 0) {
          message =
            "Autopilot started in background — no leads currently need discovery (they may already have email). Use Ingest or check All Records.";
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
        error: err instanceof Error ? err.message : "Texas autopilot failed to start",
      });
    }
  });

  app.post("/api/texas/jobs/enrich-apollo", requireControlAuth, async (req, res) => {
    try {
      const limit =
        typeof req.body?.limit === "number" ? req.body.limit : undefined;
      res.status(200).json({
        success: true,
        message: "Texas Apollo enrichment started in background",
      });
      setImmediate(() => {
        void runTexasApolloEnrichmentBatch({ limit }).catch((err) => {
          console.error("Texas Apollo enrichment failed:", err);
        });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Texas Apollo enrichment failed",
      });
    }
  });

  app.post("/api/texas/jobs/reclassify", requireControlAuth, async (_req, res) => {
    try {
      const jobId = await createJob("texas_reclassify", {});
      deferStartJob(jobId, "texas_reclassify");
      res.status(200).json({
        success: true,
        message: "Texas reclassify started in background",
        jobId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Texas reclassify job failed",
      });
    }
  });

  app.post("/api/texas/jobs/find", requireControlAuth, async (req, res) => {
    try {
      const params: TexasFindJobParams = {
        source: typeof req.body?.source === "string" ? req.body.source : undefined,
        limit:
          typeof req.body?.limit === "number" ? req.body.limit : undefined,
        mobileOnly: req.body?.mobileOnly === true,
        fullResync: req.body?.fullResync === true,
      };
      const jobId = await createJob("find_texas", params);
      deferStartJob(jobId, "find_texas");
      res.status(200).json({
        success: true,
        message: "Texas ingest started in background",
        jobId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Texas find job failed",
      });
    }
  });
}
