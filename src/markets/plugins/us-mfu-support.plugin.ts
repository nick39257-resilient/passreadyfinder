import { runMfuSupportFindPipeline } from "../../engine/mfu-facilities/mfu-support-pipeline.js";
import { US_MFU_SUPPORT_MARKET_ID } from "../search-params.js";
import type {
  MarketFindContext,
  MarketFindResult,
  MarketPlugin,
  MarketSearchParams,
} from "../types.js";

export const usMfuSupportPlugin: MarketPlugin = {
  definition: {
    id: US_MFU_SUPPORT_MARKET_ID,
    name: "US MFU Support (CPF / Commissary)",
    mode: "regulated",
    region: "US",
    description:
      "Texas Central Preparation Facilities and Florida food-truck commissaries — MFU/MFDV service hubs only.",
    status: "active",
    supportsKeyword: true,
    locationHint: "City or state (e.g. Orlando FL, San Antonio TX). Keyword TX or FL to scope.",
    dataLane: "mfu_support_facilities",
  },

  validate(params: MarketSearchParams): string | null {
    if (!params.location?.trim()) {
      return "location is required (city or state)";
    }
    const keyword = params.keyword?.trim().toUpperCase();
    if (keyword && keyword !== "TX" && keyword !== "FL") {
      return 'keyword must be "TX", "FL", or omitted';
    }
    return null;
  },

  async runFind(
    params: MarketSearchParams,
    context: MarketFindContext,
  ): Promise<MarketFindResult> {
    const result = await runMfuSupportFindPipeline(params, context.onProgress);

    return {
      marketId: US_MFU_SUPPORT_MARKET_ID,
      mode: "regulated",
      location: params.location,
      keyword: params.keyword ?? null,
      fetched: result.fetched,
      stored: result.stored,
      details: {
        scope: result.scope,
        texasCount: result.texasCount,
        floridaCount: result.floridaCount,
      },
    };
  },
};
