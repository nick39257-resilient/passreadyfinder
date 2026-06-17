import type { Express } from "express";
import { createJob } from "../engine/store/jobs-repository.js";
import { executeFloridaLeadOutreach } from "../engine/florida/florida-outreach-executor.js";
import { runMigrations } from "../engine/store/db.js";
import {
  getFloridaLeadById,
  listFloridaLeads,
} from "../engine/store/florida-leads-repository.js";
import { deferStartJob } from "./autopilot-kickoff.js";
import { getActiveJobId } from "./pipeline-status.js";
import { US_FLORIDA_FOOD_MARKET_ID } from "../markets/search-params.js";

function mapFloridaLeadRow(row: Awaited<ReturnType<typeof getFloridaLeadById>>) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    businessName: row.business_name,
    address: row.address,
    city: row.city,
    county: row.county,
    zip: row.zip,
    phone: row.phone,
    email: row.email,
    website: row.website,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    licenseNumber: row.license_number,
    riskLevel: row.risk_level,
    inspectionScore: row.inspection_score,
    priorityViolations: row.priority_violations,
    lastInspectionDate: row.last_inspection_date,
    riskScore: row.risk_score,
    status: row.status,
    enrichmentStatus: row.enrichment_status,
    enrichmentDetail: row.enrichment_detail,
    outreachReady:
      row.status === "ready_to_contact" ||
      Boolean(row.email?.trim() || row.facebook_url?.trim() || row.instagram_url?.trim()),
  };
}

export function mountFloridaRoutes(app: Express): void {
  app.get("/api/florida/leads", async (req, res) => {
    try {
      await runMigrations();
      const limit = Number(req.query.limit);
      const location =
        typeof req.query.location === "string" ? req.query.location.trim() : undefined;
      const rows = await listFloridaLeads(
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200,
        { location },
      );

      res.json({
        leads: rows.map((row) => mapFloridaLeadRow(row)!),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to list Florida leads" });
    }
  });

  app.post("/api/florida/enrich", async (req, res) => {
    try {
      await runMigrations();
      const active = await getActiveJobId("regulatory_enrich");
      if (active) {
        res.status(409).json({ error: "Enrichment already running", jobId: active });
        return;
      }

      const location =
        typeof req.body?.location === "string" ? req.body.location.trim() : undefined;
      const limit = Number(req.body?.limit);
      const jobId = await createJob("regulatory_enrich", {
        marketId: US_FLORIDA_FOOD_MARKET_ID,
        location: location ?? null,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 40,
      });
      deferStartJob(jobId, "regulatory_enrich");
      res.status(202).json({ jobId, marketId: US_FLORIDA_FOOD_MARKET_ID, location: location ?? null });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start Florida enrichment" });
    }
  });

  app.post("/api/florida/leads/:id/trigger-outreach", async (req, res) => {
    try {
      await runMigrations();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Invalid lead id" });
        return;
      }

      const result = await executeFloridaLeadOutreach(id);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Florida outreach failed";
      res.status(500).json({ error: message });
    }
  });
}
