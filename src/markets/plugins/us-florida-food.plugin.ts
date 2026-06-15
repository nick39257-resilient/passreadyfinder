import { runFloridaFindPipeline, floridaMarketConfigured } from "../../engine/florida/florida-pipeline.js";
import { US_FLORIDA_FOOD_MARKET_ID } from "../search-params.js";
import type {
  MarketFindContext,
  MarketFindResult,
  MarketPlugin,
  MarketSearchParams,
} from "../types.js";

export const usFloridaFoodPlugin: MarketPlugin = {
  definition: {
    id: US_FLORIDA_FOOD_MARKET_ID,
    name: "Florida Food (DBPR)",
    mode: "regulated",
    region: "US-FL",
    description:
      "Florida DBPR public license/inspection CSV extracts — filter by city or county.",
    status: "active",
    supportsKeyword: false,
    locationHint: "Florida city or county (e.g. Orlando, Miami-Dade)",
    dataLane: "florida_leads",
  },

  validate(params: MarketSearchParams): string | null {
    if (!params.location?.trim()) {
      return "location is required (Florida city or county)";
    }
    if (!floridaMarketConfigured()) {
      return "Set FLORIDA_DBPR_DATA_URL to a DBPR district CSV from MyFloridaLicense public records";
    }
    return null;
  },

  async runFind(
    params: MarketSearchParams,
    context: MarketFindContext,
  ): Promise<MarketFindResult> {
    await context.onProgress?.(`Ingesting Florida DBPR data for ${params.location}…`);

    const result = await runFloridaFindPipeline({
      location: params.location,
      limit: params.limit,
    });

    return {
      marketId: US_FLORIDA_FOOD_MARKET_ID,
      mode: "regulated",
      location: params.location,
      keyword: params.keyword ?? null,
      fetched: result.fetched,
      stored: result.stored,
      details: {
        criticalCount: result.criticalCount,
        source: result.source,
      },
    };
  },
};
