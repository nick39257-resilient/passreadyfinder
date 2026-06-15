import { runTexasFindPipeline } from "../../engine/texas/texas-pipeline.js";
import type { TexasFindJobParams } from "../../types/texas.js";
import { US_TEXAS_FOOD_MARKET_ID } from "../search-params.js";
import type {
  MarketFindContext,
  MarketFindResult,
  MarketPlugin,
  MarketSearchParams,
} from "../types.js";

function toTexasFindParams(params: MarketSearchParams): TexasFindJobParams {
  const texas: TexasFindJobParams = {};
  if (params.source?.trim()) {
    texas.source = params.source.trim();
  }
  if (params.limit !== undefined) {
    texas.limit = params.limit;
  }
  if (params.mobileOnly) {
    texas.mobileOnly = true;
  }
  if (params.fullResync) {
    texas.fullResync = true;
  }
  return texas;
}

export const usTexasFoodPlugin: MarketPlugin = {
  definition: {
    id: US_TEXAS_FOOD_MARKET_ID,
    name: "Texas Food Inspections",
    mode: "regulated",
    region: "US-TX",
    description:
      "Municipal open-data health inspections (default Austin/Travis). HB 2844 mobile vendor tiers and risk scoring.",
    status: "active",
    supportsKeyword: false,
    locationHint: "Austin, TX (additional city feeds in Phase 3+)",
    dataLane: "texas_leads",
  },

  validate(params: MarketSearchParams): string | null {
    if (!params.location?.trim()) {
      return "location is required (e.g. Austin, TX)";
    }
    if (params.keyword?.trim()) {
      return "Keyword filter for Texas ingest is planned — use mobileOnly or source for now";
    }
    return null;
  },

  async runFind(
    params: MarketSearchParams,
    context: MarketFindContext,
  ): Promise<MarketFindResult> {
    await context.onProgress?.(
      params.mobileOnly
        ? "Ingesting Texas mobile food units (open data)…"
        : "Ingesting Texas health inspection open data…",
    );

    const result = await runTexasFindPipeline(toTexasFindParams(params));

    return {
      marketId: US_TEXAS_FOOD_MARKET_ID,
      mode: "regulated",
      location: params.location,
      keyword: params.keyword ?? null,
      fetched: result.fetched,
      stored: result.stored,
      details: {
        mobileVendors: result.mobileVendors,
        criticalCount: result.criticalCount,
        source: result.source,
      },
    };
  },
};
