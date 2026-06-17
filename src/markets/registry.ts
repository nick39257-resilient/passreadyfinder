import type { MarketDefinition, MarketPlugin } from "./types.js";
import {
  OPEN_SEARCH_MARKET_ID,
  UK_FSA_FOOD_MARKET_ID,
  US_FLORIDA_FOOD_MARKET_ID,
  US_MFU_SUPPORT_MARKET_ID,
  US_TEXAS_FOOD_MARKET_ID,
} from "./search-params.js";
import { ukFsaFoodPlugin } from "./plugins/uk-fsa-food.plugin.js";
import { usTexasFoodPlugin } from "./plugins/us-texas-food.plugin.js";
import { openSearchPlugin } from "./plugins/open-search.plugin.js";
import { usFloridaFoodPlugin } from "./plugins/us-florida-food.plugin.js";
import { usMfuSupportPlugin } from "./plugins/us-mfu-support.plugin.js";
import { floridaMarketConfigured } from "../engine/florida/florida-pipeline.js";

const PLUGINS: MarketPlugin[] = [
  ukFsaFoodPlugin,
  usTexasFoodPlugin,
  openSearchPlugin,
  usFloridaFoodPlugin,
  usMfuSupportPlugin,
];

const byId = new Map<string, MarketPlugin>(
  PLUGINS.map((plugin) => [plugin.definition.id, plugin]),
);

export function getMarketPlugin(marketId: string): MarketPlugin | null {
  return byId.get(marketId.trim().toLowerCase()) ?? null;
}

export function listMarketDefinitions(): MarketDefinition[] {
  return PLUGINS.map((p) => {
    if (
      p.definition.id === US_FLORIDA_FOOD_MARKET_ID &&
      !floridaMarketConfigured()
    ) {
      return { ...p.definition, status: "planned" as const };
    }
    return p.definition;
  });
}

export function listActiveMarkets(): MarketDefinition[] {
  return listMarketDefinitions().filter((m) => m.status === "active");
}

export function resolveMarketForLegacyJobType(
  jobType: string,
): MarketPlugin | null {
  if (jobType === "find") {
    return getMarketPlugin(UK_FSA_FOOD_MARKET_ID);
  }
  if (jobType === "find_texas") {
    return getMarketPlugin(US_TEXAS_FOOD_MARKET_ID);
  }
  return null;
}
