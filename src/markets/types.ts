/** Regulated = official compliance feeds; open = OSM/DDG keyword search (Phase 2+). */
export type MarketOperatingMode = "regulated" | "open";

export type MarketStatus = "active" | "planned";

export interface MarketDefinition {
  id: string;
  name: string;
  mode: MarketOperatingMode;
  /** ISO-ish region label shown in UI — e.g. UK, US-TX, US-FL */
  region: string;
  description: string;
  status: MarketStatus;
  /** Whether free-text keyword affects the find run */
  supportsKeyword: boolean;
  locationHint: string;
  /** Lead table / outreach lane this market writes to */
  dataLane: "uk_leads" | "texas_leads" | "florida_leads" | "generic_leads";
}

/** Unified search request — all find jobs normalize to this shape. */
export interface MarketSearchParams {
  marketId: string;
  location: string;
  keyword?: string | null;
  mode?: MarketOperatingMode;
  postcodePrefix?: string | null;
  targetRating?: number | null;
  worstFirst?: boolean;
  fullResync?: boolean;
  mobileOnly?: boolean;
  limit?: number;
  source?: string | null;
  authorityBatch?: boolean;
  enrichTopNOverride?: number;
  skipEnrichment?: boolean;
}

export interface MarketFindContext {
  jobId?: string;
  onProgress?: (message: string) => void | Promise<void>;
}

export interface MarketFindResult {
  marketId: string;
  mode: MarketOperatingMode;
  location: string;
  keyword: string | null;
  fetched: number;
  stored: number;
  /** Plugin-specific metrics (FSA delta rows, Texas mobile count, etc.) */
  details: Record<string, unknown>;
}

export interface MarketPlugin {
  definition: MarketDefinition;
  /** Returns human-readable error, or null if valid. */
  validate(params: MarketSearchParams): string | null;
  runFind(
    params: MarketSearchParams,
    context: MarketFindContext,
  ): Promise<MarketFindResult>;
}

export interface MarketListItem extends MarketDefinition {
  legacyJobType?: string;
}
