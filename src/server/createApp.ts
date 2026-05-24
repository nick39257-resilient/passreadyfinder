import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../engine/store/db.js";
import {
  approveDraft,
  getDraftsForReview,
  rejectDraft,
} from "../engine/store/review-repository.js";
import {
  consumeSendConfirmToken,
  createJob,
  createSendConfirmToken,
  getJob,
} from "../engine/store/jobs-repository.js";
import {
  countApprovedLeads,
  getLeadStatusCounts,
} from "../engine/store/stats-repository.js";
import { startJob } from "./job-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");

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

  app.get("/api/stats", async (_req, res) => {
    try {
      const counts = await getLeadStatusCounts();
      res.json(counts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch stats" });
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

  app.post("/api/jobs/find", requireControlAuth, async (_req, res) => {
    try {
      const jobId = await createJob("find");
      startJob(jobId, "find");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start find job" });
    }
  });

  app.post("/api/jobs/draft", requireControlAuth, async (_req, res) => {
    try {
      const jobId = await createJob("draft");
      startJob(jobId, "draft");
      res.status(202).json({ jobId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start draft job" });
    }
  });

  app.get("/api/send/preview", requireControlAuth, async (_req, res) => {
    try {
      const approvedCount = await countApprovedLeads();
      if (approvedCount === 0) {
        res.json({ approvedCount: 0, confirmToken: null });
        return;
      }

      const confirmToken = await createSendConfirmToken(approvedCount);
      res.json({ approvedCount, confirmToken });
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
      const currentCount = await countApprovedLeads();
      if (currentCount === 0) {
        res.status(400).json({ error: "No approved leads to send" });
        return;
      }
      if (currentCount !== expectedCount) {
        res.status(409).json({
          error: `Approved count changed (${expectedCount} → ${currentCount}). Preview again.`,
          approvedCount: currentCount,
        });
        return;
      }

      const tokenCheck = await consumeSendConfirmToken(confirmToken, expectedCount);
      if (!tokenCheck.ok) {
        res.status(400).json({ error: tokenCheck.reason });
        return;
      }

      const jobId = await createJob("send");
      startJob(jobId, "send");
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

  if (options?.serveStatic) {
    app.get("/", (_req, res) => {
      res.sendFile(path.join(publicDir, "control.html"));
    });

    app.get("/review", (_req, res) => {
      res.sendFile(path.join(publicDir, "review.html"));
    });

    app.use(express.static(publicDir, { index: false }));
  }

  return app;
}

/** @deprecated Use createApp */
export const createReviewApp = createApp;
