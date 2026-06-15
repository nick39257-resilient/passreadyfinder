import type { Express } from "express";
import { listGenericLeads } from "../engine/store/generic-leads-repository.js";
import { OPEN_SEARCH_MARKET_ID } from "../markets/search-params.js";

function parseGapReasons(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function mountGenericLeadsRoutes(app: Express): void {
  app.get("/api/generic-leads", async (req, res) => {
    try {
      const marketId =
        typeof req.query.marketId === "string"
          ? req.query.marketId.trim()
          : OPEN_SEARCH_MARKET_ID;
      const runId =
        typeof req.query.runId === "string" ? req.query.runId.trim() : undefined;
      const limit = Number(req.query.limit);
      const rows = await listGenericLeads({
        marketId,
        runId: runId || undefined,
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200,
      });

      res.json({
        leads: rows.map((row) => ({
          id: row.id,
          marketId: row.market_id,
          runId: row.run_id,
          businessName: row.business_name,
          keyword: row.keyword,
          locationLabel: row.location_label,
          address: row.address,
          city: row.city,
          postcode: row.postcode,
          latitude: row.latitude,
          longitude: row.longitude,
          phone: row.phone,
          website: row.website,
          email: row.email,
          gapReasons: parseGapReasons(row.gap_reasons),
          priorityScore: row.priority_score,
          status: row.status,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to list generic leads" });
    }
  });
}
