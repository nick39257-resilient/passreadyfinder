import { logEngineError, logFindLeadsResult } from "../engine/intelligence/system-status.js";
import { runMigrations } from "../engine/store/db.js";
import { getMarketPlugin } from "./registry.js";
import type {
  MarketFindContext,
  MarketFindResult,
  MarketSearchParams,
} from "./types.js";

export class MarketFindError extends Error {
  constructor(
    message: string,
    readonly code: "UNKNOWN_MARKET" | "VALIDATION" | "NOT_IMPLEMENTED",
  ) {
    super(message);
    this.name = "MarketFindError";
  }
}

/**
 * Unified find entry — dispatches to the registered market plugin.
 * Phase 1: UK FSA + Texas only (regulated compliance mode).
 */
export async function runMarketFind(
  params: MarketSearchParams,
  context: MarketFindContext = {},
): Promise<MarketFindResult> {
  await runMigrations();

  const marketId = params.marketId.trim().toLowerCase();
  const plugin = getMarketPlugin(marketId);
  if (!plugin) {
    throw new MarketFindError(`Unknown market: ${marketId}`, "UNKNOWN_MARKET");
  }

  if (plugin.definition.status !== "active") {
    throw new MarketFindError(
      `${plugin.definition.name} is not available yet (${plugin.definition.status})`,
      "NOT_IMPLEMENTED",
    );
  }

  if (params.mode && params.mode !== plugin.definition.mode) {
    throw new MarketFindError(
      `Market ${marketId} runs in ${plugin.definition.mode} mode, not ${params.mode}`,
      "VALIDATION",
    );
  }

  const validationError = plugin.validate(params);
  if (validationError) {
    throw new MarketFindError(validationError, "VALIDATION");
  }

  console.log(
    `MarketFind [${marketId}] location=${params.location}${params.keyword ? ` keyword=${params.keyword}` : ""}`,
  );

  try {
    const result = await plugin.runFind(params, context);
    if (marketId === "uk_fsa_food") {
      await logFindLeadsResult({ stored: result.stored, fetched: result.fetched });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEngineError("find", `MarketFind ${marketId} failed`, message);
    throw err;
  }
}
