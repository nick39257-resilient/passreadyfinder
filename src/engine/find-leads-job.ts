import type { FindJobParams } from "../types/segmentation.js";
import { logEngineError, logFindLeadsResult } from "./intelligence/system-status.js";
import { runFindPipeline, type PipelineResult } from "./pipeline.js";
import { runMigrations } from "./store/db.js";

export type FindLeadsJobResult = PipelineResult;

/**
 * Finder workflow — scrape FSA, score, enrich, upsert DB only. No drafting or sending.
 */
export async function runFindLeadsJob(options?: {
  jobId?: string;
  skipEnrichment?: boolean;
  segmentation?: FindJobParams;
  onProgress?: (message: string) => void | Promise<void>;
  /** UK cron: process a slice of authorities per run. */
  authorityBatch?: boolean;
  enrichTopNOverride?: number;
}): Promise<FindLeadsJobResult> {
  await runMigrations();
  console.log("FindLeads: scrape → score → store (no drafting)\n");
  try {
    const result = await runFindPipeline({
      skipEnrichment: options?.skipEnrichment,
      segmentation: options?.segmentation,
      onProgress: options?.onProgress,
      authorityBatch: options?.authorityBatch,
      enrichTopNOverride: options?.enrichTopNOverride,
      updateSyncTimestamp: options?.authorityBatch ? undefined : true,
    });
    await logFindLeadsResult({ stored: result.stored, fetched: result.fetched });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEngineError("find", "FindLeads failed", message);
    throw err;
  }
}
