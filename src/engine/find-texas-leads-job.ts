import type { TexasFindJobParams, TexasIngestionResult } from "../types/texas.js";
import {
  marketSearchFromTexasFindJobParams,
  US_TEXAS_FOOD_MARKET_ID,
} from "../markets/search-params.js";
import { runMarketFind } from "../markets/run-market-find.js";

/**
 * Texas open-data ingest via market plugin.
 * @deprecated Prefer runMarketFind with marketId us_texas_food
 */
export async function runFindTexasLeadsJob(options?: {
  segmentation?: TexasFindJobParams;
}): Promise<TexasIngestionResult> {
  console.log("FindTexas: open-data ingest → texas_leads (isolated from UK FSA)\n");

  const result = await runMarketFind(
    marketSearchFromTexasFindJobParams(options?.segmentation),
  );

  const details = result.details;
  const ingestion: TexasIngestionResult = {
    fetched: result.fetched,
    stored: result.stored,
    mobileVendors: Number(details.mobileVendors ?? 0),
    criticalCount: Number(details.criticalCount ?? 0),
    source: String(details.source ?? "unknown"),
  };

  console.log(
    `Texas ingest done: ${ingestion.stored} stored (${ingestion.criticalCount} critical, ${ingestion.mobileVendors} mobile) from ${ingestion.source}`,
  );

  if (result.marketId !== US_TEXAS_FOOD_MARKET_ID) {
    throw new Error(`Expected Texas market result, got ${result.marketId}`);
  }

  return ingestion;
}
