import type { Express, Request, Response } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  getScoreTrafficCounts,
  recordScoreTrafficHit,
  type ScoreTrafficSite,
} from "../engine/store/score-traffic-repository.js";

/** 1×1 transparent GIF */
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

type ControlAuth = (req: Request, res: Response, next: () => void) => void;

function parseSite(raw: unknown): ScoreTrafficSite | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "uk" || value === "us") {
    return value;
  }
  return null;
}

function trafficKeyAuthorized(req: Request): boolean {
  const secret = process.env.SCORE_TRAFFIC_SECRET?.trim();
  if (!secret) {
    const referer = String(req.headers.referer ?? req.headers.origin ?? "").toLowerCase();
    return (
      referer.includes("score.passready.uk") ||
      referer.includes("score.passready.us") ||
      referer.includes("passready.uk") ||
      referer.includes("passready.us")
    );
  }

  const fromQuery = typeof req.query.key === "string" ? req.query.key.trim() : "";
  const fromHeader = String(req.headers["x-score-traffic-key"] ?? "").trim();
  return fromQuery === secret || fromHeader === secret;
}

function sendPixel(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(PIXEL_GIF);
}

export function mountScoreTrafficRoutes(
  app: Express,
  requireControlAuth: ControlAuth,
): void {
  app.get("/api/score-traffic/pixel.gif", async (req, res) => {
    try {
      const site = parseSite(req.query.site);
      if (!site || !trafficKeyAuthorized(req)) {
        sendPixel(res);
        return;
      }
      await runMigrations();
      await recordScoreTrafficHit(site);
      sendPixel(res);
    } catch (err) {
      console.error(err);
      sendPixel(res);
    }
  });

  app.post("/api/score-traffic/hit", async (req, res) => {
    try {
      const site = parseSite(req.body?.site ?? req.query.site);
      if (!site) {
        res.status(400).json({ error: "site must be uk or us" });
        return;
      }
      if (!trafficKeyAuthorized(req)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      await runMigrations();
      await recordScoreTrafficHit(site);
      res.json({ ok: true, site });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to record score traffic hit" });
    }
  });

  app.get("/api/score-traffic/stats", requireControlAuth, async (_req, res) => {
    try {
      await runMigrations();
      const counts = await getScoreTrafficCounts();
      res.json(counts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load score traffic stats" });
    }
  });
}
