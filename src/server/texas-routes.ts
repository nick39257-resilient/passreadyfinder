import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  countTexasLeads,
  getAllTexasLeads,
  getTexasLeadById,
} from "../engine/store/texas-leads-repository.js";
import { runTexasApolloEnrichmentBatch } from "../engine/texas/texas-enrichment-service.js";
import { executeTexasLeadOutreach } from "../engine/texas/texas-outreach-executor.js";
import { mapTexasLeadRowToApi } from "./texas-api-mapper.js";
import { createJob } from "../engine/store/jobs-repository.js";
import { startJob } from "./job-runner.js";
import type { TexasFindJobParams } from "../types/texas.js";

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

export function mountTexasRoutes(
  app: Express,
  requireControlAuth: ControlAuth,
): void {
  app.get("/api/texas/stats", requireControlAuth, async (_req, res) => {
    try {
      await runMigrations();
      const counts = await countTexasLeads();
      res.json({ region: "TEXAS", ...counts });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load Texas stats" });
    }
  });

  app.get("/api/texas/leads", requireControlAuth, async (req, res) => {
    try {
      await runMigrations();
      const mobileOnly =
        req.query.mobileOnly === "1" || req.query.mobileOnly === "true";
      const rows = await getAllTexasLeads({ mobileOnly });
      res.json({ leads: rows.map(mapTexasLeadRowToApi) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load Texas leads" });
    }
  });

  app.get("/api/texas/leads/:id", requireControlAuth, async (req, res) => {
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

  app.post("/api/texas/jobs/enrich-apollo", requireControlAuth, async (req, res) => {
    try {
      await runMigrations();
      const limit =
        typeof req.body?.limit === "number" ? req.body.limit : undefined;
      const summary = await runTexasApolloEnrichmentBatch({ limit });
      res.json({ ok: true, summary });
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
      startJob(jobId, "texas_reclassify");
      res.status(202).json({ jobId });
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
      startJob(jobId, "find_texas");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Texas find job failed",
      });
    }
  });
}
