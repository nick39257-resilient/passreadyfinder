import type { FindJobParams } from "../types/segmentation.js";
import {
  parseArea,
  parsePostcodePrefix,
  parseTargetRating,
} from "../types/segmentation.js";
import type { TexasFindJobParams } from "../types/texas.js";
import type { MarketSearchParams } from "./types.js";

export const UK_FSA_FOOD_MARKET_ID = "uk_fsa_food";
export const US_TEXAS_FOOD_MARKET_ID = "us_texas_food";
export const OPEN_SEARCH_MARKET_ID = "open_search";
export const US_FLORIDA_FOOD_MARKET_ID = "us_florida_food";
export const US_MFU_SUPPORT_MARKET_ID = "us_mfu_support";

export function parseMarketId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length >= 2 ? trimmed : null;
}

export function parseMarketSearchParams(body: unknown): MarketSearchParams | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const raw = body as Record<string, unknown>;
  const marketId = parseMarketId(raw.marketId);
  const location = parseArea(raw.location ?? raw.area);
  if (!marketId || !location) {
    return null;
  }

  const keyword =
    typeof raw.keyword === "string" && raw.keyword.trim()
      ? raw.keyword.trim()
      : null;

  const modeRaw =
    typeof raw.mode === "string" ? raw.mode.trim().toLowerCase() : undefined;
  const mode =
    modeRaw === "regulated" || modeRaw === "open"
      ? modeRaw
      : undefined;

  const targetRating = parseTargetRating(raw.targetRating);
  const postcodePrefix = parsePostcodePrefix(raw.postcodePrefix);

  return {
    marketId,
    location,
    keyword,
    mode,
    postcodePrefix,
    targetRating,
    worstFirst: raw.worstFirst !== false,
    fullResync: raw.fullResync === true,
    mobileOnly: raw.mobileOnly === true,
    limit:
      typeof raw.limit === "number" && Number.isFinite(raw.limit)
        ? raw.limit
        : undefined,
    source:
      typeof raw.source === "string" && raw.source.trim()
        ? raw.source.trim()
        : null,
    authorityBatch: raw.authorityBatch === true,
    enrichTopNOverride:
      typeof raw.enrichTopNOverride === "number" &&
      Number.isFinite(raw.enrichTopNOverride)
        ? raw.enrichTopNOverride
        : undefined,
    skipEnrichment: raw.skipEnrichment === true,
  };
}

/** Legacy UK find job params → market search. */
export function marketSearchFromFindJobParams(
  params: FindJobParams,
): MarketSearchParams {
  return {
    marketId: UK_FSA_FOOD_MARKET_ID,
    location: params.area,
    postcodePrefix: params.postcodePrefix ?? null,
    targetRating: params.targetRating ?? null,
    worstFirst: params.worstFirst ?? true,
    fullResync: params.fullResync === true,
  };
}

/** Legacy Texas find job params → market search. */
export function marketSearchFromTexasFindJobParams(
  params: TexasFindJobParams | undefined,
  location = "Austin, TX",
): MarketSearchParams {
  return {
    marketId: US_TEXAS_FOOD_MARKET_ID,
    location,
    source: params?.source ?? null,
    limit: params?.limit,
    mobileOnly: params?.mobileOnly === true,
    fullResync: params?.fullResync === true,
  };
}
