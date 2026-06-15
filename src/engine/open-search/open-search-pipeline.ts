import { randomUUID } from "crypto";
import { searchDuckDuckGoOnce } from "../search/web-search-discovery.js";
import { upsertGenericLead } from "../store/generic-leads-repository.js";
import { geocodeLocation } from "./nominatim.js";
import { searchOsmBusinessesInArea } from "./overpass-area-search.js";
import { scoreOpenSearchLead } from "./open-search-scorer.js";
import { OPEN_SEARCH_MARKET_ID } from "../../markets/search-params.js";

export interface OpenSearchPipelineResult {
  runId: string;
  geocoded: string;
  latitude: number;
  longitude: number;
  fetched: number;
  stored: number;
  enrichedWebsites: number;
}

export async function runOpenSearchPipeline(input: {
  keyword: string;
  location: string;
  runId?: string;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<OpenSearchPipelineResult> {
  const keyword = input.keyword.trim();
  const location = input.location.trim();
  if (!keyword) {
    throw new Error("keyword is required for open search");
  }

  const runId = input.runId ?? randomUUID();
  const report = async (msg: string) => {
    await input.onProgress?.(msg);
  };

  await report(`Geocoding ${location}…`);
  const geo = await geocodeLocation(location);
  if (!geo) {
    throw new Error(`Could not geocode location: ${location}`);
  }

  await report(`Scanning OSM for "${keyword}" near ${geo.displayName}…`);
  const businesses = await searchOsmBusinessesInArea({
    keyword,
    latitude: geo.latitude,
    longitude: geo.longitude,
  });

  let stored = 0;
  let enrichedWebsites = 0;

  for (let i = 0; i < businesses.length; i++) {
    let biz = businesses[i];
    if (!biz.website) {
      const query = `${biz.businessName} ${location}`;
      const website = await searchDuckDuckGoOnce(query, "open-search-ddg");
      if (website) {
        biz = { ...biz, website };
        enrichedWebsites++;
      }
    }

    const scored = scoreOpenSearchLead(biz);
    await upsertGenericLead({
      marketId: OPEN_SEARCH_MARKET_ID,
      runId,
      externalId: biz.osmId,
      keyword,
      locationLabel: location,
      businessName: biz.businessName,
      address: biz.address,
      city: biz.city,
      postcode: biz.postcode,
      latitude: biz.latitude,
      longitude: biz.longitude,
      phone: biz.phone,
      website: biz.website,
      email: biz.email,
      gapReasons: scored.gapReasons,
      priorityScore: scored.priorityScore,
    });
    stored++;

    if (i > 0 && i % 10 === 0) {
      await report(`Indexed ${i}/${businesses.length}…`);
    }
  }

  await report(`Open search complete — ${stored} targets indexed.`);

  return {
    runId,
    geocoded: geo.displayName,
    latitude: geo.latitude,
    longitude: geo.longitude,
    fetched: businesses.length,
    stored,
    enrichedWebsites,
  };
}
