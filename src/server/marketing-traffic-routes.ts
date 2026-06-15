import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  parseMarketingSource,
  parsePostcodeOutward,
  recordMarketingTrafficHit,
} from "../engine/store/marketing-traffic-repository.js";

const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

function sendPixel(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(PIXEL_GIF);
}

function parseSite(raw: unknown): "uk" | "us" {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return value === "us" ? "us" : "uk";
}

function trafficRefererAllowed(req: Request): boolean {
  const referer = String(req.headers.referer ?? req.headers.origin ?? "").toLowerCase();
  return (
    referer.includes("passready.uk") ||
    referer.includes("passready.us") ||
    referer.includes("score.passready.uk") ||
    referer.includes("score.passready.us") ||
    referer.includes("localhost")
  );
}

export function mountMarketingTrafficRoutes(
  app: Express,
  requireControlAuth: ControlAuth,
): void {
  app.get("/api/marketing-traffic/pixel.gif", async (req, res) => {
    try {
      const source = parseMarketingSource(req.query.source) ?? "web";
      const physicalSource = source === "flyer" || source === "nfc";
      if (!physicalSource && !trafficRefererAllowed(req)) {
        sendPixel(res);
        return;
      }

      await runMigrations();
      await recordMarketingTrafficHit({
        source,
        site: parseSite(req.query.site),
        postcodeOutward: parsePostcodeOutward(req.query.pc ?? req.query.postcode ?? req.query.area),
        path: typeof req.query.path === "string" ? req.query.path : null,
      });
      sendPixel(res);
    } catch (err) {
      console.error("[marketing-traffic/pixel]", err);
      sendPixel(res);
    }
  });

  app.post("/api/marketing-traffic/hit", async (req, res) => {
    try {
      const source = parseMarketingSource(req.body?.source ?? req.query.source);
      if (!source) {
        res.status(400).json({ error: "source must be flyer, nfc, web, or direct" });
        return;
      }
      await runMigrations();
      await recordMarketingTrafficHit({
        source,
        site: parseSite(req.body?.site ?? req.query.site),
        postcodeOutward: parsePostcodeOutward(
          req.body?.pc ?? req.body?.postcode ?? req.query.pc ?? req.query.postcode,
        ),
        path: typeof req.body?.path === "string" ? req.body.path : null,
      });
      res.json({ ok: true, source });
    } catch (err) {
      console.error("[marketing-traffic/hit]", err);
      res.status(500).json({ error: "Failed to record marketing hit" });
    }
  });

  app.get("/api/marketing-traffic/stats/today", requireControlAuth, async (_req, res) => {
    try {
      await runMigrations();
      const { getMarketingTrafficTodayCounts, getRegionalMarketingTrafficToday } = await import(
        "../engine/store/marketing-traffic-repository.js"
      );
      const [counts, regions] = await Promise.all([
        getMarketingTrafficTodayCounts(),
        getRegionalMarketingTrafficToday(20),
      ]);
      res.json({ counts, regions });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load marketing traffic stats" });
    }
  });
}
