import express, { type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../engine/store/db.js";
import {
  approveDraft,
  getDraftsForReview,
  queueLeadToPostbox,
  rejectDraft,
} from "../engine/store/review-repository.js";
import {
  consumeSendConfirmToken,
  createJob,
  createSendConfirmToken,
  getJob,
  updateJob,
} from "../engine/store/jobs-repository.js";
import {
  countApprovedLeads,
  getFunnelStats,
  getLeadStatusCounts,
} from "../engine/store/stats-repository.js";
import { getDeliverabilityStatus } from "../engine/deliverability.js";
import { getComplianceTipOfDay } from "../engine/intelligence/compliance.js";
import { getSystemActivity } from "../engine/intelligence/activity.js";
import { getSystemStatus } from "../engine/intelligence/system-status.js";
import { getAllLeads, getLeadById } from "../engine/store/leads-repository.js";
import { fetchAuthorities } from "../engine/finder/authorities.js";
import { updateLeadEmail } from "../engine/enrich/lead-email.js";
import {
  parseArea,
  parsePostcodePrefix,
  parseTargetRating,
} from "../types/segmentation.js";
import { getDailySendQuota } from "../engine/daily-send-cap.js";
import {
  isLeadOutreachHalted,
  markLeadConverted,
  stopSequenceForReply,
  suppressLeadByToken,
} from "../engine/outreach-halt.js";
import { formatRouteError } from "./quick-draft-handler.js";
import { mapLeadRowToApiLead } from "./lead-api-mapper.js";
import { startJob } from "./job-runner.js";
import { getNextUkSendWindowLabel } from "../engine/send-schedule.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "../..");
const publicDir = path.join(projectRoot, "public");
const dashboardDir = path.join(projectRoot, "dashboard/dist");
const dashboardIndex = path.join(dashboardDir, "index.html");

function mountDashboard(app: express.Express): void {
  if (!fs.existsSync(dashboardIndex)) {
    console.warn(
      `React dashboard not built (missing ${dashboardIndex}) — run: NPM_CONFIG_PRODUCTION=false npm install --prefix dashboard && npm run dashboard:build`,
    );
    app.get(["/dashboard", "/dashboard/*splat"], (_req, res) => {
      res.status(503).type("html").send(
        "<!DOCTYPE html><html><body style=\"font-family:system-ui;padding:2rem\"><h1>Dashboard not built</h1><p>On Render, set the build command to install dashboard devDependencies (see <code>render.yaml</code>) and redeploy.</p></body></html>",
      );
    });
    return;
  }

  app.use(
    "/dashboard",
    express.static(dashboardDir, { index: "index.html", redirect: false }),
  );

  app.get(["/dashboard", "/dashboard/"], (_req, res) => {
    res.sendFile(dashboardIndex);
  });

  app.get("/dashboard/*splat", (req, res, next) => {
    const subpath = String(req.params.splat ?? "");
    if (subpath.length > 0 && subpath.includes(".")) {
      next();
      return;
    }
    res.sendFile(dashboardIndex);
  });
}

let migrationsDone = false;

async function ensureMigrations(): Promise<void> {
  if (!migrationsDone) {
    await runMigrations();
    migrationsDone = true;
  }
}

function requireControlAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CONTROL_PANEL_SECRET?.trim();
  if (!secret) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (header === `Bearer ${secret}`) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized — set Authorization: Bearer <CONTROL_PANEL_SECRET>" });
}

export async function createApp(options?: {
  serveStatic?: boolean;
}): Promise<express.Express> {
  await ensureMigrations();

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      requiresControlSecret: Boolean(process.env.CONTROL_PANEL_SECRET?.trim()),
    });
  });

  app.get("/api/outreach/unsubscribe", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      res.status(400).type("html").send("<p>Missing unsubscribe token.</p>");
      return;
    }

    try {
      const ok = await suppressLeadByToken(token);
      if (!ok) {
        res.status(404).type("html").send("<p>This unsubscribe link is invalid or expired.</p>");
        return;
      }
      res.status(200).type("html").send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;">
<h1>You are unsubscribed</h1>
<p>We will not email this business again. If this was a mistake, contact PassReady support.</p>
</body></html>`,
      );
    } catch (err) {
      console.error(err);
      res.status(500).type("html").send("<p>Could not process unsubscribe. Try again later.</p>");
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const counts = await getLeadStatusCounts();
      const deliverability = await getDeliverabilityStatus();
      const funnel = await getFunnelStats();
      res.json({ ...counts, deliverability, funnel });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/funnel", async (_req, res) => {
    try {
      res.json(await getFunnelStats());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch funnel" });
    }
  });

  app.get("/api/activity", async (_req, res) => {
    try {
      const items = await getSystemActivity();
      res.json({ items, complianceTip: getComplianceTipOfDay() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.get("/api/status", async (_req, res) => {
    try {
      res.json(await getSystemStatus(5));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch system status" });
    }
  });

  app.get("/api/fsa/authorities", async (_req, res) => {
    try {
      const authorities = await fetchAuthorities();
      res.json({ authorities });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch FSA authorities" });
    }
  });

  app.get("/api/leads", async (_req, res) => {
    try {
      const rows = await getAllLeads();
      const leads = await Promise.all(
        rows.map((row) => mapLeadRowToApiLead(row, { includeComparables: false })),
      );
      leads.sort((a, b) => b.riskScore - a.riskScore || b.id - a.id);
      res.json({ leads });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    try {
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      res.json({ lead: await mapLeadRowToApiLead(row, { ensureFsaScores: true }) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  app.post("/api/leads/:id/stop-sequence", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    try {
      await stopSequenceForReply(id);
      res.json({ ok: true, status: "replied" });
    } catch (err) {
      const message = formatRouteError(err);
      console.error("Stop-sequence failed:", message, err);
      if (message === "Lead not found") {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  /** @deprecated Use POST /api/leads/:id/stop-sequence */
  app.post("/api/leads/:id/mark-replied", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    try {
      await stopSequenceForReply(id);
      res.json({ ok: true, status: "replied" });
    } catch (err) {
      const message = formatRouteError(err);
      res.status(message === "Lead not found" ? 404 : 500).json({ error: message });
    }
  });

  app.post("/api/leads/:id/mark-converted", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    const stage = req.body?.stage;
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    if (stage !== "opted_in" && stage !== "trial_started") {
      res.status(400).json({ error: "stage must be opted_in or trial_started" });
      return;
    }

    try {
      await markLeadConverted(id, stage);
      res.json({ ok: true, status: stage });
    } catch (err) {
      const message = formatRouteError(err);
      if (message === "Lead not found") {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/leads/:id/set-email", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    try {
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      await updateLeadEmail(id, email);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to set business email" });
    }
  });

  app.post("/api/leads/:id/quick-draft", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    try {
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      const hasReplied = Boolean((row as { replied_at?: string | null }).replied_at);
      if (isLeadOutreachHalted(row)) {
        res.status(409).json({ error: "Outreach is halted for this business" });
        return;
      }
      if (row.contacted_at && row.status !== "replied" && !hasReplied) {
        res.status(409).json({
          error:
            "Lead already contacted — use “Mark as replied — stop sequence” or mark converted first",
        });
        return;
      }

      const jobId = await createJob("quick_draft", { leadId: id });
      startJob(jobId, "quick_draft");
      res.status(202).json({ jobId });
    } catch (err) {
      const message = formatRouteError(err);
      console.error("Quick-draft failed:", message, err);
      const status = message.includes("not configured") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/deliverability", async (_req, res) => {
    try {
      res.json(await getDeliverabilityStatus());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch deliverability" });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const job = await getJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      let result: unknown = null;
      if (job.result) {
        try {
          result = JSON.parse(job.result);
        } catch {
          result = job.result;
        }
      }

      res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        result,
        error: job.error,
        created_at: job.created_at,
        updated_at: job.updated_at,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.post("/api/jobs/find", requireControlAuth, async (req, res) => {
    const area = parseArea(req.body?.area);
    const targetRating = parseTargetRating(req.body?.targetRating);
    const postcodePrefix = parsePostcodePrefix(req.body?.postcodePrefix);
    const worstFirst = req.body?.worstFirst !== false;

    if (!area) {
      res.status(400).json({ error: "area is required (local authority name, e.g. Preston)" });
      return;
    }
    if (!worstFirst && !targetRating) {
      res.status(400).json({ error: "targetRating must be 2, 3, 4, or 5" });
      return;
    }
    if (req.body?.postcodePrefix && !postcodePrefix) {
      res.status(400).json({ error: "postcodePrefix must be a valid UK postcode area, e.g. PR1" });
      return;
    }

    try {
      const jobId = await createJob("find", {
        area,
        worstFirst,
        ...(postcodePrefix ? { postcodePrefix } : {}),
        ...(targetRating ? { targetRating } : {}),
      });
      startJob(jobId, "find");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start find job" });
    }
  });

  app.post("/api/jobs/draft", requireControlAuth, async (req, res) => {
    const targetRating = parseTargetRating(req.body?.targetRating);
    const params = targetRating ? { targetRating } : undefined;

    try {
      const jobId = await createJob("draft", params);
      startJob(jobId, "draft");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start draft job" });
    }
  });

  app.post("/api/jobs/draft-all", requireControlAuth, async (_req, res) => {
    try {
      const jobId = await createJob("draft_all");
      startJob(jobId, "draft_all");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start auto-draft job" });
    }
  });

  app.get("/api/send/preview", requireControlAuth, async (_req, res) => {
    try {
      const deliverability = await getDeliverabilityStatus();
      if (deliverability.sendLocked) {
        res.json({
          approvedCount: 0,
          confirmToken: null,
          sendLocked: true,
          reason: deliverability.reason,
        });
        return;
      }

      const approvedCount = await countApprovedLeads();
      const dailyQuota = await getDailySendQuota();
      const sendableCount = Math.min(approvedCount, dailyQuota.remaining);

      if (approvedCount === 0 || sendableCount === 0) {
        res.json({
          approvedCount,
          sendableCount: 0,
          confirmToken: null,
          sendLocked: false,
          dailyQuota,
          dailyCapReached: dailyQuota.remaining <= 0,
        });
        return;
      }

      const confirmToken = await createSendConfirmToken(sendableCount);
      res.json({
        approvedCount,
        sendableCount,
        confirmToken,
        sendLocked: false,
        dailyQuota,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to preview send" });
    }
  });

  app.post("/api/jobs/send", requireControlAuth, async (req, res) => {
    const confirmToken =
      typeof req.body?.confirmToken === "string" ? req.body.confirmToken.trim() : "";
    const expectedCount = Number(req.body?.expectedCount);

    if (!confirmToken) {
      res.status(400).json({ error: "confirmToken is required" });
      return;
    }
    if (!Number.isInteger(expectedCount) || expectedCount < 1) {
      res.status(400).json({ error: "expectedCount must be a positive integer" });
      return;
    }

    try {
      const deliverability = await getDeliverabilityStatus();
      if (deliverability.sendLocked) {
        res.status(423).json({ error: deliverability.reason, sendLocked: true });
        return;
      }

      const approvedCount = await countApprovedLeads();
      const dailyQuota = await getDailySendQuota();
      const sendableCount = Math.min(approvedCount, dailyQuota.remaining);

      if (approvedCount === 0 || sendableCount === 0) {
        res.status(400).json({ error: "No approved leads to send" });
        return;
      }
      if (sendableCount !== expectedCount) {
        res.status(409).json({
          error: `Send batch size changed (${expectedCount} → ${sendableCount}). Preview again.`,
          approvedCount,
          sendableCount,
        });
        return;
      }

      const tokenCheck = await consumeSendConfirmToken(confirmToken, expectedCount);
      if (!tokenCheck.ok) {
        res.status(400).json({ error: tokenCheck.reason });
        return;
      }

      const scheduledForUk = getNextUkSendWindowLabel();
      const jobId = await createJob("send", {
        mode: "deferred_to_uk_2pm",
        sendableCount,
      });
      await updateJob(jobId, {
        status: "done",
        progress: `Queued for UK send window (${scheduledForUk})`,
        result: {
          queued: true,
          sendableCount,
          scheduledForUk,
          note: "Approved leads are sent automatically at 2pm UK time.",
        },
      });
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start send job" });
    }
  });

  app.get("/api/drafts", async (_req, res) => {
    try {
      const drafts = await getDraftsForReview();
      res.json(drafts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch drafts" });
    }
  });

  app.post("/api/drafts/:id/approve", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const draftMessage = req.body?.draft_message;
    if (typeof draftMessage !== "string" || !draftMessage.trim()) {
      res.status(400).json({ error: "draft_message is required" });
      return;
    }

    try {
      const updated = await approveDraft(id, draftMessage);
      if (!updated) {
        res.status(404).json({ error: "Draft not found or already reviewed" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to approve draft" });
    }
  });

  app.post("/api/drafts/:id/reject", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const updated = await rejectDraft(id);
      if (!updated) {
        res.status(404).json({ error: "Draft not found or already reviewed" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to reject draft" });
    }
  });

  app.post("/api/leads/:id/postbox", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    try {
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      if (!row.email?.trim()) {
        res.status(409).json({
          error:
            "No business email on file for this takeaway. Run Find leads (enrichment) or wait until a website email is discovered before adding to postbox.",
        });
        return;
      }

      const ok = await queueLeadToPostbox(id);
      if (!ok) {
        res.status(409).json({
          error: "Lead must be drafted with a business email before it can be queued to postbox",
        });
        return;
      }
      res.json({ ok: true, status: "approved" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to queue lead to postbox" });
    }
  });

  if (options?.serveStatic) {
    app.get("/", (_req, res) => {
      res.sendFile(path.join(publicDir, "control.html"));
    });

    app.get("/review", (_req, res) => {
      res.sendFile(path.join(publicDir, "review.html"));
    });

    mountDashboard(app);

    app.use(express.static(publicDir, { index: false }));
  }

  return app;
}

/** @deprecated Use createApp */
export const createReviewApp = createApp;
