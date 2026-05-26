import type { FindJobParams } from "../types/segmentation.js";
import { runFindPipeline, type PipelineResult } from "./pipeline.js";
import { runMigrations } from "./store/db.js";

export type FindLeadsJobResult = PipelineResult;

/**
 * Finder workflow — scrape FSA, score, enrich, upsert DB only. No drafting or sending.
 */
export async function runFindLeadsJob(options?: {
  skipEnrichment?: boolean;
  segmentation?: FindJobParams;
}): Promise<FindLeadsJobResult> {
  await runMigrations();
  console.log("FindLeads: scrape → score → store (no drafting)\n");
  return runFindPipeline({
    skipEnrichment: options?.skipEnrichment,
    segmentation: options?.segmentation,
  });
}
