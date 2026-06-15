import type { Express } from "express";
import { listFloridaLeads } from "../engine/store/florida-leads-repository.js";

export function mountFloridaRoutes(app: Express): void {
  app.get("/api/florida/leads", async (req, res) => {
    try {
      const limit = Number(req.query.limit);
      const rows = await listFloridaLeads(
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200,
      );

      res.json({
        leads: rows.map((row) => ({
          id: row.id,
          businessName: row.business_name,
          address: row.address,
          city: row.city,
          county: row.county,
          zip: row.zip,
          phone: row.phone,
          email: row.email,
          licenseNumber: row.license_number,
          riskLevel: row.risk_level,
          inspectionScore: row.inspection_score,
          priorityViolations: row.priority_violations,
          lastInspectionDate: row.last_inspection_date,
          riskScore: row.risk_score,
          status: row.status,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to list Florida leads" });
    }
  });
}
