import type { TexasFindJobParams, TexasIngestionResult } from "../types/texas.js";
import { logEngineError } from "./intelligence/system-status.js";
import { runTexasFindPipeline } from "./texas/texas-pipeline.js";

export async function runFindTexasLeadsJob(
  options?: { segmentation?: TexasFindJobParams },
): Promise<TexasIngestionResult> {
  console.log("FindTexas: open-data ingest → texas_leads (isolated from UK FSA)\n");
  try {
    const result = await runTexasFindPipeline(options?.segmentation);
    console.log(
      `Texas ingest done: ${result.stored} stored (${result.criticalCount} critical, ${result.mobileVendors} mobile) from ${result.source}`,
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEngineError("find_texas", "FindTexas failed", message);
    throw err;
  }
}
