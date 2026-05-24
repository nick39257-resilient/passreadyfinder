import { productConfig } from "../../config/product.config.js";
import type { OsmEnrichmentResult, DeliveryAppStatus } from "../../types/lead.js";
import { getOsmCache, setOsmCache } from "../store/leads-repository.js";

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function escapeOverpassRegex(value: string): string {
  return value.replace(/[\\.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhone(raw: string | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  return raw.trim();
}

function normalizeWebsite(raw: string | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/** Best-effort only — no maps source reliably knows delivery-app presence */
function detectDeliveryApp(tags: Record<string, string> | undefined): DeliveryAppStatus {
  if (!tags) {
    return "unknown";
  }
  const deliveryKeys = ["delivery", "delivery:partner", "brand:wikidata"];
  for (const key of deliveryKeys) {
    const val = tags[key]?.toLowerCase() ?? "";
    if (val.includes("just eat") || val.includes("deliveroo") || val.includes("uber eats")) {
      return "true";
    }
  }
  return "unknown";
}

function extractContact(element: OverpassElement): OsmEnrichmentResult {
  const tags = element.tags ?? {};
  const phone =
    normalizePhone(tags["contact:phone"]) ??
    normalizePhone(tags.phone) ??
    normalizePhone(tags["contact:mobile"]);
  const website =
    normalizeWebsite(tags["contact:website"]) ??
    normalizeWebsite(tags.website) ??
    normalizeWebsite(tags.url);
  const onDeliveryApp = detectDeliveryApp(tags);

  return { phone, website, onDeliveryApp };
}

function sanitizeNameForOverpass(name: string): string {
  // Use first meaningful token — avoids regex breakage on "T/A", slashes, etc.
  const cleaned = name.replace(/\s+t\/a\s+.*/i, "").trim();
  const token = cleaned.split(/[\s/]+/).find((w) => w.length >= 3) ?? cleaned;
  return escapeOverpassRegex(token.slice(0, 30));
}

function buildOverpassQuery(businessName: string, lat: number, lon: number): string {
  const radius = productConfig.osm.searchRadiusMetres;
  const namePattern = sanitizeNameForOverpass(businessName);

  return `
    [out:json][timeout:25];
    (
      nwr["name"~"${namePattern}",i](around:${radius},${lat},${lon});
      nwr["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream",i](around:${radius},${lat},${lon});
    );
    out center tags;
  `.trim();
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const response = await fetch(productConfig.osm.overpassUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "passreadyfinder/1.0 (contact enrichment; passready)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Overpass API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<OverpassResponse>;
}

function pickBestMatch(
  elements: OverpassElement[],
  businessName: string,
): OverpassElement | null {
  if (elements.length === 0) {
    return null;
  }

  const normalizedTarget = businessName.toLowerCase().replace(/[^a-z0-9]/g, "");

  let best: OverpassElement | null = null;
  let bestScore = -1;

  for (const el of elements) {
    const normalizedName = el.tags?.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    let score = 0;
    if (normalizedName === normalizedTarget) {
      score += 100;
    } else if (
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName)
    ) {
      score += 50;
    }
    if (el.tags?.phone || el.tags?.["contact:phone"]) {
      score += 10;
    }
    if (el.tags?.website || el.tags?.["contact:website"]) {
      score += 5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

export interface EnrichInput {
  fsaId: number;
  businessName: string;
  latitude: number;
  longitude: number;
}

export async function enrichFromOsm(input: EnrichInput): Promise<OsmEnrichmentResult> {
  const cached = await getOsmCache(input.fsaId);
  if (cached) {
    return {
      phone: cached.phone,
      website: cached.website,
      onDeliveryApp: cached.on_delivery_app,
    };
  }

  if (!input.latitude || !input.longitude) {
    const empty: OsmEnrichmentResult = {
      phone: null,
      website: null,
      onDeliveryApp: "unknown",
    };
    await setOsmCache(input.fsaId, { ...empty });
    return empty;
  }

  const query = buildOverpassQuery(input.businessName, input.latitude, input.longitude);
  const response = await queryOverpass(query);
  const match = pickBestMatch(response.elements, input.businessName);
  const result = match
    ? extractContact(match)
    : { phone: null, website: null, onDeliveryApp: "unknown" as const };

  await setOsmCache(input.fsaId, {
    ...result,
    rawResponse: JSON.stringify(response).slice(0, 4000),
  });

  return result;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
