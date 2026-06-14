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
  getInFlightSendJob,
  getJob,
} from "../engine/store/jobs-repository.js";
import {
  auditPostboxLeads,
  countApprovedLeads,
  countSendReadyLeads,
  getFunnelStats,
  getLeadStatusCounts,
} from "../engine/store/stats-repository.js";
import { getDeliverabilityStatus } from "../engine/deliverability.js";
import { getComplianceTipOfDay } from "../engine/intelligence/compliance.js";
import { getSystemActivity } from "../engine/intelligence/activity.js";
import { getSystemStatus } from "../engine/intelligence/system-status.js";
import {
  getDashboardLeads,
  getLeadById,
  setLeadFlagForReview,
  setLeadStatus,
} from "../engine/store/leads-repository.js";
import { fetchAuthorities } from "../engine/finder/authorities.js";
import {
  formatSyncStatusLabel,
  leadChangedSinceSync,
} from "../engine/sync/sync-label.js";
import { getLastSyncTimestamp } from "../engine/sync/fsa-sync-state.js";
import { includeInDashboardList } from "../engine/lead-display-policy.js";
import { isValidOutreachEmail } from "../engine/outreach-email.js";
import { getOutreachLandingUrl } from "../engine/outreach-landing-url.js";
import { buildOutboundWaMeLink } from "../engine/whatsapp-link.js";
import { tryEnrichLeadEmailFromWebsite, updateLeadEmail } from "../engine/enrich/lead-email.js";
import {
  getContactDiscoveryApi,
  getContactDiscoverySummaries,
  updateContactDiscoveryManual,
} from "../engine/store/contact-discovery-repository.js";
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
  suppressLead,
  suppressLeadByToken,
} from "../engine/outreach-halt.js";
import { formatRouteError } from "./quick-draft-handler.js";
import { mapLeadRowToApiLead } from "./lead-api-mapper.js";
import { handleResendInboundWebhook } from "./resend-inbound-webhook.js";
import { startJob } from "./job-runner.js";
import {
  reclaimAllInFlightJobs,
  reclaimOrphanedJobsOnStartup,
} from "../engine/store/job-stale-reclaim.js";
import { mountTexasRoutes } from "./texas-routes.js";
import { mountUkRoutes } from "./uk-routes.js";
import { mountScoreTrafficRoutes } from "./score-traffic-routes.js";
import {
  isCopilotOutreachMode,
  isEmailAutosendEnabled,
  isWarmOnlyEmailEnabled,
} from "../engine/outreach-strategy.js";
import {
  buildActionQueueDigest,
  markLeadCallLogged,
  markLeadWhatsAppSent,
} from "../engine/action-queue/action-queue-service.js";
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
let startupJobsReclaimed = false;

async function ensureMigrations(): Promise<void> {
  if (!migrationsDone) {
    await runMigrations();
    migrationsDone = true;
  }
  if (!startupJobsReclaimed) {
    startupJobsReclaimed = true;
    await reclaimOrphanedJobsOnStartup();
  }
}

function requireControlAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CONTROL_PANEL_SECRET?.trim();
  if (!secret) {
    next();
    return;
  }

  const auth = req.headers.authorization?.trim();
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

export async function createApp(options?: {
  serveStatic?: boolean;
}): Promise<express.Express> {
  await ensureMigrations();

  const app = express();

  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json" }),
    (req, res) => {
      void handleResendInboundWebhook(req, res);
    },
  );

  app.use(express.json());

  mountTexasRoutes(app, requireControlAuth);
  mountUkRoutes(app, requireControlAuth);
  mountScoreTrafficRoutes(app, requireControlAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      requiresControlSecret: Boolean(process.env.CONTROL_PANEL_SECRET?.trim()),
      outreachLandingUrl: getOutreachLandingUrl(),
      copilotMode: isCopilotOutreachMode(),
      emailAutosend: isEmailAutosendEnabled(),
      warmOnlyEmail: isWarmOnlyEmailEnabled(),
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
      const postbox = await auditPostboxLeads();
      res.json({
        ...counts,
        deliverability,
        funnel,
        postbox: {
          queued: postbox.queued,
          sendReady: postbox.sendReady,
          blocked: postbox.blocked,
        },
      });
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

  app.get("/api/sync/status", async (_req, res) => {
    try {
      const lastSyncAt = await getLastSyncTimestamp();
      res.json({
        lastSyncAt,
        hasInitialSync: Boolean(lastSyncAt),
        label: formatSyncStatusLabel(lastSyncAt),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch sync status" });
    }
  });

  app.get("/api/leads", async (_req, res) => {
    try {
      const lastSyncAt = await getLastSyncTimestamp();
      const rows = await getDashboardLeads();
      let summaries = new Map<
        number,
        {
          contactScore: number;
          contactable: boolean;
          email: string | null;
          phone: string | null;
          whatsapp: string | null;
        }
      >();
      try {
        summaries = await getContactDiscoverySummaries(rows.map((r) => r.id));
      } catch (summaryErr) {
        console.error("Contact discovery summaries unavailable:", summaryErr);
      }
      const mappedLeads = await Promise.all(
        rows.map(async (row) => {
          const summary = summaries.get(row.id);
          const resolvedEmail = row.email?.trim() || summary?.email?.trim() || null;
          const resolvedPhone = row.phone?.trim() || summary?.phone?.trim() || null;
          const resolvedWhatsapp = summary?.whatsapp?.trim() || null;
          const mapped = await mapLeadRowToApiLead(row, {
            includeComparables: false,
            contactScore: summary?.contactScore ?? 0,
            contactable:
              summary?.contactable ??
              Boolean(resolvedEmail || resolvedPhone),
          });
          const whatsappUrl = buildOutboundWaMeLink({
            businessName: mapped.businessName,
            phone: resolvedPhone,
            whatsapp: resolvedWhatsapp,
          });
          return {
            ...mapped,
            email: resolvedEmail,
            phone: resolvedPhone ?? mapped.phone,
            whatsappUrl,
            recentlyChanged: leadChangedSinceSync(row.updated_at, lastSyncAt),
          };
        }),
      );
      const leads = mappedLeads.filter((lead) =>
        includeInDashboardList({
          businessType: lead.businessType,
          fsaRating: lead.fsaRating,
          email: lead.email,
          phone: lead.phone,
          website: lead.website,
          status: lead.status,
        }),
      );
      leads.sort((a, b) => b.riskScore - a.riskScore || b.id - a.id);
      res.json({
        leads,
        sync: {
          lastSyncAt,
          hasInitialSync: Boolean(lastSyncAt),
          label: formatSyncStatusLabel(lastSyncAt),
        },
      });
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
      const contactDiscovery = await getContactDiscoveryApi(id);
      const mapped = await mapLeadRowToApiLead(row, {
        ensureFsaScores: true,
        contactScore: contactDiscovery?.contactScore ?? 0,
        contactable: contactDiscovery?.contactable ?? false,
        contactDiscovery,
      });
      const resolvedPhone = row.phone?.trim() || contactDiscovery?.phone?.trim() || null;
      res.json({
        lead: {
          ...mapped,
          phone: resolvedPhone ?? mapped.phone,
          whatsappUrl: buildOutboundWaMeLink({
            businessName: mapped.businessName,
            phone: resolvedPhone,
            whatsapp: contactDiscovery?.whatsapp ?? null,
          }),
        },
      });
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

  app.post("/api/leads/:id/mark-not-interested", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    try {
      await suppressLead(id, "not_interested");
      res.json({ ok: true, status: "suppressed" });
    } catch (err) {
      const message = formatRouteError(err);
      res.status(message === "Lead not found" ? 404 : 500).json({ error: message });
    }
  });

  app.post("/api/leads/:id/mark-visited", requireControlAuth, async (req, res) => {
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
      await setLeadStatus(id, "visited");
      res.json({ ok: true, status: "visited" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to mark visited" });
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

  app.post("/api/leads/:id/flag-review", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    const flagged = Boolean(req.body?.flagged);
    try {
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      await setLeadFlagForReview(id, flagged);
      res.json({ ok: true, flagged });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update review flag" });
    }
  });

  app.post("/api/leads/:id/discover-contacts", requireControlAuth, async (req, res) => {
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
      const jobId = await createJob("contact_discovery", { leadId: id });
      startJob(jobId, "contact_discovery");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start contact discovery" });
    }
  });

  app.patch("/api/leads/:id/contact-discovery", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    const body = req.body ?? {};
    try {
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }

      await updateContactDiscoveryManual(id, {
        website: typeof body.website === "string" ? body.website.trim() || null : undefined,
        email: typeof body.email === "string" ? body.email.trim() || null : undefined,
        contactPageUrl:
          typeof body.contactPageUrl === "string" ? body.contactPageUrl.trim() || null : undefined,
        contactFormDetected:
          typeof body.contactFormDetected === "boolean" ? body.contactFormDetected : undefined,
        facebookUrl:
          typeof body.facebookUrl === "string" ? body.facebookUrl.trim() || null : undefined,
        instagramUrl:
          typeof body.instagramUrl === "string" ? body.instagramUrl.trim() || null : undefined,
        whatsapp: typeof body.whatsapp === "string" ? body.whatsapp.trim() || null : undefined,
        phone: typeof body.phone === "string" ? body.phone.trim() || null : undefined,
        draftEmail:
          typeof body.draftEmail === "string" ? body.draftEmail.trim() || null : undefined,
        draftContactForm:
          typeof body.draftContactForm === "string" ? body.draftContactForm.trim() || null : undefined,
        draftFacebook:
          typeof body.draftFacebook === "string" ? body.draftFacebook.trim() || null : undefined,
        draftWhatsapp:
          typeof body.draftWhatsapp === "string" ? body.draftWhatsapp.trim() || null : undefined,
        draftPhoneScript:
          typeof body.draftPhoneScript === "string" ? body.draftPhoneScript.trim() || null : undefined,
      });

      if (typeof body.email === "string" && body.email.trim()) {
        await updateLeadEmail(id, body.email.trim());
      }

      const contactDiscovery = await getContactDiscoveryApi(id);
      res.json({ ok: true, contactDiscovery });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update contact discovery" });
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
      const { getDeliverabilityReport } = await import("../engine/deliverability-report.js");
      res.json(await getDeliverabilityReport());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch deliverability" });
    }
  });

  app.post("/api/deliverability/test-send", requireControlAuth, async (req, res) => {
    try {
      const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
      const regionRaw = typeof req.body?.region === "string" ? req.body.region.trim().toLowerCase() : "uk";
      const region = regionRaw === "us" ? "us" : "uk";

      const { sendDeliverabilityTest } = await import("../engine/deliverability-test-send.js");
      const result = await sendDeliverabilityTest({ to, region });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Deliverability test send failed:", message);
      const status = message.includes("not configured") || message.includes("Invalid") ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/action-queue/digest", async (_req, res) => {
    try {
      res.json(await buildActionQueueDigest());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to build action queue digest" });
    }
  });

  app.post("/api/leads/:id/mark-whatsapp-sent", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    try {
      await markLeadWhatsAppSent(id);
      res.json({ ok: true });
    } catch (err) {
      const message = formatRouteError(err);
      const status =
        message === "Lead not found"
          ? 404
          : message.includes("daily cap")
            ? 429
            : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/leads/:id/mark-call-logged", requireControlAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    try {
      await markLeadCallLogged(id);
      res.json({ ok: true });
    } catch (err) {
      const message = formatRouteError(err);
      res.status(message === "Lead not found" ? 404 : 500).json({ error: message });
    }
  });

  app.post("/api/jobs/reset-stuck", requireControlAuth, async (_req, res) => {
    try {
      const reclaimed = await reclaimAllInFlightJobs(
        "Manually reset — dashboard pulse cleared",
      );
      res.json({ reclaimed, pulse: "idle" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to reset stuck jobs" });
    }
  });

  app.post("/api/jobs/triage", requireControlAuth, async (_req, res) => {
    try {
      const { runLeadTriage } = await import("../engine/lead-triage.js");
      const result = await runLeadTriage();
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to run lead triage" });
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
      res.status(400).json({ error: "area is required (e.g. UK, Preston, Lancashire)" });
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
        fullResync: req.body?.fullResync === true,
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
      const sendReadyCount = await countSendReadyLeads();
      const dailyQuota = await getDailySendQuota();
      const sendableCount = Math.min(sendReadyCount, dailyQuota.remaining);

      if (approvedCount === 0 || sendReadyCount === 0 || sendableCount === 0) {
        res.json({
          approvedCount,
          sendReadyCount,
          sendableCount: 0,
          confirmToken: null,
          sendLocked: false,
          dailyQuota,
          dailyCapReached: dailyQuota.remaining <= 0,
          blockedCount: Math.max(0, approvedCount - sendReadyCount),
        });
        return;
      }

      const confirmToken = await createSendConfirmToken(sendableCount);
      res.json({
        approvedCount,
        sendReadyCount,
        sendableCount,
        confirmToken,
        sendLocked: false,
        dailyQuota,
        blockedCount: Math.max(0, approvedCount - sendReadyCount),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to preview send" });
    }
  });

  app.post("/api/jobs/send", requireControlAuth, async (_req, res) => {
    try {
      const deliverability = await getDeliverabilityStatus();
      if (deliverability.sendLocked) {
        res.status(423).json({ error: deliverability.reason, sendLocked: true });
        return;
      }

      const approvedCount = await countApprovedLeads();
      const sendReadyCount = await countSendReadyLeads();
      const dailyQuota = await getDailySendQuota();
      const sendableCount = Math.min(sendReadyCount, dailyQuota.remaining);

      const inFlightSend = await getInFlightSendJob();
      if (inFlightSend) {
        res.status(409).json({
          error: "Send job already in progress — wait for the current batch to finish.",
          jobId: inFlightSend.id,
          status: inFlightSend.status,
        });
        return;
      }

      if (sendReadyCount === 0 || sendableCount === 0) {
        res.status(200).json({
          success: true,
          message:
            sendReadyCount === 0
              ? "No send-ready leads in queue (ready_to_contact with valid email)."
              : "Daily send cap reached — nothing to send.",
          jobId: null,
          approvedCount,
          sendReadyCount,
          sendableCount: 0,
          dailyQuota,
        });
        return;
      }

      const jobId = await createJob("send", { sendableCount });
      startJob(jobId, "send");
      res.status(202).json({
        success: true,
        message: `Outbound batch started (${sendableCount} lead(s) queued, max 50 per run).`,
        jobId,
        approvedCount,
        sendReadyCount,
        sendableCount,
        dailyQuota,
      });
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
      const row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Draft not found or already reviewed" });
        return;
      }
      if (!isValidOutreachEmail(row.email)) {
        res.status(409).json({
          error:
            "Lead needs a valid business email before postbox send — fix the address in the dashboard first.",
        });
        return;
      }

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
      let row = await getLeadById(id);
      if (!row) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      if (!row.email?.trim() && row.website?.trim()) {
        await tryEnrichLeadEmailFromWebsite(id, row.website);
        row = (await getLeadById(id)) ?? row;
      }
      if (!row.email?.trim()) {
        res.status(409).json({
          error:
            "No business email yet — open the lead, add an email, then tap Send to postbox.",
        });
        return;
      }
      if (!isValidOutreachEmail(row.email)) {
        res.status(409).json({
          error:
            "Email looks invalid or blocked (privacy/noreply/scraped junk). Fix it before postbox send.",
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
      res.redirect(302, "/dashboard/");
    });

    app.get("/control", (_req, res) => {
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
