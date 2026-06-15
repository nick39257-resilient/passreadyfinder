import type { FindJobParams } from "../types/segmentation.js";
import { marketSearchFromFindJobParams } from "../markets/search-params.js";
import { runMarketFind } from "../markets/run-market-find.js";
import type { MarketFindResult } from "../markets/types.js";
import type { PipelineResult } from "./pipeline.js";

/** UK find job result — market envelope + legacy FSA pipeline fields. */
export type FindLeadsJobResult = MarketFindResult &
  Partial<Pick<PipelineResult, keyof PipelineResult>>;

/**
 * Finder workflow — UK FSA market plugin (scrape → score → enrich → store).
 * @deprecated Prefer runMarketFind with marketId uk_fsa_food
 */
export async function runFindLeadsJob(options?: {
  jobId?: string;
  skipEnrichment?: boolean;
  segmentation?: FindJobParams;
  onProgress?: (message: string) => void | Promise<void>;
  authorityBatch?: boolean;
  enrichTopNOverride?: number;
}): Promise<FindLeadsJobResult> {
  console.log("FindLeads: scrape → score → store (no drafting)\n");

  const segmentation = options?.segmentation ?? {
    area: "UK",
    worstFirst: true,
  };

  const search = marketSearchFromFindJobParams(segmentation);
  if (options?.skipEnrichment) {
    search.skipEnrichment = true;
  }
  if (options?.authorityBatch) {
    search.authorityBatch = true;
  }
  if (options?.enrichTopNOverride !== undefined) {
    search.enrichTopNOverride = options.enrichTopNOverride;
  }

  const result = await runMarketFind(search, {
    jobId: options?.jobId,
    onProgress: options?.onProgress,
  });

  // Flatten plugin details for legacy callers (find-cron, dashboard job result).
  return {
    ...result,
    ...result.details,
  } as FindLeadsJobResult;
}
