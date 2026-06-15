import { runOpenSearchPipeline } from "../../engine/open-search/open-search-pipeline.js";
import { OPEN_SEARCH_MARKET_ID } from "../search-params.js";
import type {
  MarketFindContext,
  MarketFindResult,
  MarketPlugin,
  MarketSearchParams,
} from "../types.js";

export const openSearchPlugin: MarketPlugin = {
  definition: {
    id: OPEN_SEARCH_MARKET_ID,
    name: "Open Search (any keyword)",
    mode: "open",
    region: "*",
    description:
      "Map any business keyword to any city via OSM Overpass + DuckDuckGo website enrichment.",
    status: "active",
    supportsKeyword: true,
    locationHint: "City, county, or postcode (e.g. Preston, UK)",
    dataLane: "generic_leads",
  },

  validate(params: MarketSearchParams): string | null {
    if (!params.location?.trim()) {
      return "location is required (city or postcode)";
    }
    if (!params.keyword?.trim()) {
      return "keyword is required for open search (e.g. electricians, builders)";
    }
    return null;
  },

  async runFind(
    params: MarketSearchParams,
    context: MarketFindContext,
  ): Promise<MarketFindResult> {
    const result = await runOpenSearchPipeline({
      keyword: params.keyword!.trim(),
      location: params.location.trim(),
      runId: context.jobId,
      onProgress: context.onProgress,
    });

    return {
      marketId: OPEN_SEARCH_MARKET_ID,
      mode: "open",
      location: params.location,
      keyword: params.keyword ?? null,
      fetched: result.fetched,
      stored: result.stored,
      details: {
        runId: result.runId,
        geocoded: result.geocoded,
        latitude: result.latitude,
        longitude: result.longitude,
        enrichedWebsites: result.enrichedWebsites,
      },
    };
  },
};
