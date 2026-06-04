import { productConfig } from "../../config/product.config.js";
import type { OsmEnrichmentResult, DeliveryAppStatus } from "../../types/lead.js";
import { overpassResponseSchema } from "../../validation/osm.schemas.js";
import { getOsmCache, setOsmCache } from "../store/leads-repository.js";

/** Required by OSM / Overpass usage policy — never use the default fetch UA. */
export const OSM_USER_AGENT = "PassReadyFinder/1.0 (contact@passready.co.uk)";

/** Minimum gap between consecutive Overpass HTTP requests (1 req/s policy + buffer). */
export const OSM_REQUEST_INTERVAL_MS = 1200;

const OVERPASS_FETCH_TIMEOUT_MS = 30_000;

type OverpassElement = ReturnType<typeof overpassResponseSchema.parse>["elements"][number];

let lastOsmNetworkRequestAt = 0;

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

function normalizeEmail(raw: string | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }
  return trimmed;
}

function emptyOsmResult(): OsmEnrichmentResult {
  return { phone: null, website: null, email: null, onDeliveryApp: "unknown" };
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
  const email =
    normalizeEmail(tags["contact:email"]) ?? normalizeEmail(tags.email);
  const onDeliveryApp = detectDeliveryApp(tags);

  return { phone, website, onDeliveryApp, email };
}

function sanitizeNameForOverpass(name: string): string {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Enforce ≥1.2s between live Overpass network calls (shared across all callers). */
export async function waitForOsmRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastOsmNetworkRequestAt;
  const waitMs = OSM_REQUEST_INTERVAL_MS - elapsed;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastOsmNetworkRequestAt = Date.now();
}

async function queryOverpass(
  query: string,
  contextLabel: string,
): Promise<ReturnType<typeof overpassResponseSchema.parse>> {
  await waitForOsmRateLimit();

  try {
    const response = await fetch(productConfig.osm.overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": OSM_USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(OVERPASS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Overpass API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const json: unknown = await response.json();
    return overpassResponseSchema.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`OSM Overpass fetch failed (${contextLabel}): ${message}`);
  }
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
    const empty = emptyOsmResult();
    try {
      await setOsmCache(input.fsaId, { ...empty });
    } catch {
      /* cache write optional */
    }
    return empty;
  }

  const contextLabel = `${input.businessName} (fsa ${input.fsaId})`;

  try {
    const query = buildOverpassQuery(input.businessName, input.latitude, input.longitude);
    const response = await queryOverpass(query, contextLabel);
    const match = pickBestMatch(response.elements, input.businessName);
    const result = match ? extractContact(match) : emptyOsmResult();

    try {
      await setOsmCache(input.fsaId, {
        ...result,
        rawResponse: JSON.stringify(response).slice(0, 4000),
      });
    } catch (cacheErr) {
      console.warn(
        `OSM cache write failed for ${contextLabel}: ${
          cacheErr instanceof Error ? cacheErr.message : cacheErr
        }`,
      );
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`OSM lookup failed for ${contextLabel}: ${message}`);

    const empty = emptyOsmResult();
    try {
      await setOsmCache(input.fsaId, { ...empty });
    } catch {
      /* avoid retry storm on next run */
    }
    return empty;
  }
}
