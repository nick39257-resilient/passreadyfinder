import type { Express } from "express";
import { runMigrations } from "../engine/store/db.js";
import {
  listMfuSupportFacilities,
  rowToMfuRecord,
} from "../engine/store/mfu-support-repository.js";

export function mountMfuSupportRoutes(app: Express): void {
  app.get("/api/mfu-support/facilities", async (req, res) => {
    try {
      await runMigrations();
      const limit = Number(req.query.limit);
      const location =
        typeof req.query.location === "string" ? req.query.location.trim() : undefined;
      const stateRaw = typeof req.query.state === "string" ? req.query.state.trim().toUpperCase() : "";
      const state = stateRaw === "TX" || stateRaw === "FL" ? stateRaw : undefined;

      const rows = await listMfuSupportFacilities({
        state,
        location,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 300,
      });

      res.json({
        facilities: rows.map((row) => {
          const record = rowToMfuRecord(row);
          return {
            id: row.id,
            ...record,
            outreachReady: Boolean(
              record.contact_details.phone?.trim() ||
                record.contact_details.email?.trim(),
            ),
          };
        }),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to list MFU support facilities" });
    }
  });
}
