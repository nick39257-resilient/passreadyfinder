import {
  getMarketPlugin,
  listActiveMarkets,
  listMarketDefinitions,
} from "./registry.js";
import {
  marketSearchFromFindJobParams,
  parseMarketSearchParams,
  UK_FSA_FOOD_MARKET_ID,
  US_FLORIDA_FOOD_MARKET_ID,
  US_TEXAS_FOOD_MARKET_ID,
} from "./search-params.js";

let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failed++;
  } else {
    console.log(`✓ ${message}`);
  }
}

const markets = listMarketDefinitions();
assert(markets.length >= 4, "registry lists planned + active markets");
assert(
  listActiveMarkets().every((m) => m.status === "active"),
  "active markets filter",
);
assert(
  getMarketPlugin(UK_FSA_FOOD_MARKET_ID)?.definition.mode === "regulated",
  "UK market is regulated",
);
assert(
  getMarketPlugin(US_TEXAS_FOOD_MARKET_ID)?.definition.dataLane === "texas_leads",
  "Texas market uses texas_leads lane",
);

const ukParams = parseMarketSearchParams({
  marketId: UK_FSA_FOOD_MARKET_ID,
  location: "Preston",
  postcodePrefix: "PR1",
});
assert(ukParams?.location === "Preston", "parse UK search params");
assert(
  getMarketPlugin(UK_FSA_FOOD_MARKET_ID)?.validate({
    ...ukParams!,
    keyword: "takeaway",
  }) !== null,
  "UK rejects keyword in Phase 1",
);

const legacy = marketSearchFromFindJobParams({
  area: "UK",
  worstFirst: true,
});
assert(legacy.marketId === UK_FSA_FOOD_MARKET_ID, "legacy find maps to uk_fsa_food");

const open = getMarketPlugin("open_search");
assert(open?.definition.status === "active", "open search is active");

const fl = getMarketPlugin("us_florida_food");
assert(fl?.definition.id === US_FLORIDA_FOOD_MARKET_ID, "florida plugin registered");

if (failed > 0) {
  process.exit(1);
}
console.log("\nAll market registry tests passed.");
