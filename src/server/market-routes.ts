import type { Express, NextFunction, Request, Response } from "express";
import { createJob } from "../engine/store/jobs-repository.js";
import { getActiveJobId } from "./pipeline-status.js";
import {
  listMarketDefinitions,
  getMarketPlugin,
} from "../markets/registry.js";
import {
  parseMarketSearchParams,
  UK_FSA_FOOD_MARKET_ID,
  US_TEXAS_FOOD_MARKET_ID,
} from "../markets/search-params.js";
import { MarketFindError } from "../markets/run-market-find.js";
import { geocodeLocation } from "../engine/open-search/nominatim.js";
import { deferStartJob } from "./autopilot-kickoff.js";

export function mountMarketRoutes(
  app: Express,
  requireControlAuth: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/api/geocode", async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) {
        res.status(400).json({ error: "q is required" });
        return;
      }
      const hit = await geocodeLocation(q);
      if (!hit) {
        res.status(404).json({ error: `Could not geocode: ${q}` });
        return;
      }
      res.json({
        latitude: hit.latitude,
        longitude: hit.longitude,
        displayName: hit.displayName,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Geocode failed" });
    }
  });

  app.get("/api/markets", async (_req, res) => {
    try {
      const markets = listMarketDefinitions().map((m) => ({
        ...m,
        legacyJobType:
          m.id === UK_FSA_FOOD_MARKET_ID
            ? "find"
            : m.id === US_TEXAS_FOOD_MARKET_ID
              ? "find_texas"
              : undefined,
      }));
      res.json({ markets });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to list markets" });
    }
  });

  app.get("/api/markets/:marketId", async (req, res) => {
    const plugin = getMarketPlugin(req.params.marketId);
    if (!plugin) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json({ market: plugin.definition });
  });

  app.post("/api/markets/find", async (req, res) => {
    const params = parseMarketSearchParams(req.body);
    if (!params) {
      res.status(400).json({
        error: "marketId and location are required",
        example: {
          marketId: UK_FSA_FOOD_MARKET_ID,
          location: "UK",
          keyword: null,
          mode: "regulated",
        },
      });
      return;
    }

    const plugin = getMarketPlugin(params.marketId);
    if (!plugin) {
      res.status(404).json({ error: `Unknown market: ${params.marketId}` });
      return;
    }

    const validationError = plugin.validate(params);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (plugin.definition.status !== "active") {
      res.status(501).json({
        error: `${plugin.definition.name} is not available yet`,
        status: plugin.definition.status,
      });
      return;
    }

    try {
      const active = await getActiveJobId("market_find");
      if (active) {
        res.status(409).json({
          error: "A market find job is already running",
          jobId: active,
        });
        return;
      }

      const jobId = await createJob("market_find", params);
      deferStartJob(jobId, "market_find");
      res.status(202).json({
        jobId,
        marketId: params.marketId,
        location: params.location,
        keyword: params.keyword ?? null,
      });
    } catch (err) {
      if (err instanceof MarketFindError) {
        const status =
          err.code === "UNKNOWN_MARKET"
            ? 404
            : err.code === "NOT_IMPLEMENTED"
              ? 501
              : 400;
        res.status(status).json({ error: err.message, code: err.code });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Failed to start market find job" });
    }
  });
}
