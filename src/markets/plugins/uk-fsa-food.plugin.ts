import { runFindPipeline } from "../../engine/pipeline.js";
import type { FindJobParams } from "../../types/segmentation.js";
import { UK_FSA_FOOD_MARKET_ID } from "../search-params.js";
import type {
  MarketFindContext,
  MarketFindResult,
  MarketPlugin,
  MarketSearchParams,
} from "../types.js";

function toFindJobParams(params: MarketSearchParams): FindJobParams {
  const find: FindJobParams = {
    area: params.location.trim(),
    worstFirst: params.worstFirst !== false,
    fullResync: params.fullResync === true,
  };
  if (params.postcodePrefix?.trim()) {
    find.postcodePrefix = params.postcodePrefix.trim();
  }
  if (
    params.targetRating === 2 ||
    params.targetRating === 3 ||
    params.targetRating === 4 ||
    params.targetRating === 5
  ) {
    find.targetRating = params.targetRating;
  }
  return find;
}

export const ukFsaFoodPlugin: MarketPlugin = {
  definition: {
    id: UK_FSA_FOOD_MARKET_ID,
    name: "UK Food Hygiene (FSA)",
    mode: "regulated",
    region: "UK",
    description:
      "FSA Food Hygiene Rating Scheme — takeaways, restaurants, mobile caterers. Delta-sync by rating change date.",
    status: "active",
    supportsKeyword: false,
    locationHint: "UK-wide authority name or postcode area (e.g. Preston, PR1)",
    dataLane: "uk_leads",
  },

  validate(params: MarketSearchParams): string | null {
    if (!params.location?.trim()) {
      return "location is required (e.g. UK, Preston, Lancashire)";
    }
    if (params.worstFirst === false && !params.targetRating) {
      return "targetRating must be 2, 3, 4, or 5 when worstFirst is false";
    }
    if (params.keyword?.trim()) {
      return "Keyword search is not supported for UK FSA yet — use Open Search (Phase 2) or FSA business types in config";
    }
    return null;
  },

  async runFind(
    params: MarketSearchParams,
    context: MarketFindContext,
  ): Promise<MarketFindResult> {
    const segmentation = toFindJobParams(params);
    const result = await runFindPipeline({
      skipEnrichment: params.skipEnrichment,
      segmentation,
      onProgress: context.onProgress,
      authorityBatch: params.authorityBatch,
      enrichTopNOverride: params.enrichTopNOverride,
      updateSyncTimestamp: params.authorityBatch ? undefined : true,
    });

    return {
      marketId: UK_FSA_FOOD_MARKET_ID,
      mode: "regulated",
      location: params.location,
      keyword: params.keyword ?? null,
      fetched: result.fetched,
      stored: result.stored,
      details: {
        apiRows: result.apiRows,
        deltaRows: result.deltaRows,
        pagesFetched: result.pagesFetched,
        enriched: result.enriched,
        withPhone: result.withPhone,
        withWebsite: result.withWebsite,
        deltaMode: result.deltaMode,
        fullResync: result.fullResync,
        syncTimestampUpdated: result.syncTimestampUpdated,
        lastSyncTimestamp: result.lastSyncTimestamp,
        excludedByGuardrail: result.excludedByGuardrail,
      },
    };
  },
};
