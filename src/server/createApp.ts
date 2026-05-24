import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "../engine/store/db.js";
import {
  approveDraft,
  getDraftsForReview,
  rejectDraft,
} from "../engine/store/review-repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");

let migrationsDone = false;

async function ensureMigrations(): Promise<void> {
  if (!migrationsDone) {
    await runMigrations();
    migrationsDone = true;
  }
}

export async function createReviewApp(options?: {
  serveStatic?: boolean;
}): Promise<express.Express> {
  await ensureMigrations();

  const app = express();
  app.use(express.json());

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
    app.use(express.static(publicDir));
    app.get("/", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  return app;
}
