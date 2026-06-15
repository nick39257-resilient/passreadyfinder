import { productConfig } from "../../config/product.config.js";
import { overpassResponseSchema } from "../../validation/osm.schemas.js";
import {
  OSM_USER_AGENT,
  waitForOsmRateLimit,
} from "../enrich/osm-enricher.js";
import { buildOverpassTagFilters } from "./keyword-tags.js";

export interface OsmAreaBusiness {
  osmId: string;
  businessName: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  tags: Record<string, string>;
}

function elementCoords(el: {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) {
    return { lat: el.center.lat, lon: el.center.lon };
  }
  return null;
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
  ].filter(Boolean);
  if (parts.length === 0) {
    return tags["addr:full"]?.trim() || null;
  }
  return parts.join(" ").trim() || null;
}

function normalizePhone(raw: string | undefined): string | null {
  const t = raw?.trim();
  return t || null;
}

function normalizeWebsite(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) {
    return null;
  }
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function normalizeEmail(raw: string | undefined): string | null {
  const t = raw?.trim().toLowerCase();
  return t?.includes("@") ? t : null;
}

export function openSearchRadiusMetres(): number {
  const fromEnv = Number(process.env.OPEN_SEARCH_RADIUS_METRES);
  if (Number.isFinite(fromEnv) && fromEnv >= 500 && fromEnv <= 25_000) {
    return fromEnv;
  }
  return 8000;
}

export function openSearchResultCap(): number {
  const fromEnv = Number(process.env.OPEN_SEARCH_RESULT_CAP);
  if (Number.isFinite(fromEnv) && fromEnv >= 10) {
    return Math.min(fromEnv, 500);
  }
  return 150;
}

function buildAreaQuery(
  keyword: string,
  lat: number,
  lon: number,
  radiusM: number,
): string {
  const filters = buildOverpassTagFilters(keyword);
  const union = filters.map((f) => `  ${f}(around:${radiusM},${lat},${lon});`).join("\n");

  return `
    [out:json][timeout:60];
    (
    ${union}
    );
    out center tags;
  `.trim();
}

export async function searchOsmBusinessesInArea(input: {
  keyword: string;
  latitude: number;
  longitude: number;
}): Promise<OsmAreaBusiness[]> {
  const radiusM = openSearchRadiusMetres();
  const cap = openSearchResultCap();
  const query = buildAreaQuery(
    input.keyword,
    input.latitude,
    input.longitude,
    radiusM,
  );

  await waitForOsmRateLimit();
  const response = await fetch(productConfig.osm.overpassUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": OSM_USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Overpass area search failed ${response.status}: ${text.slice(0, 200)}`);
  }

  const parsed = overpassResponseSchema.parse(await response.json());
  const seen = new Set<string>();
  const results: OsmAreaBusiness[] = [];

  for (const el of parsed.elements) {
    const coords = elementCoords(el);
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!coords || !name) {
      continue;
    }

    const osmId = `${el.type}/${el.id}`;
    if (seen.has(osmId)) {
      continue;
    }
    seen.add(osmId);

    results.push({
      osmId,
      businessName: name,
      latitude: coords.lat,
      longitude: coords.lon,
      address: buildAddress(tags),
      city: tags["addr:city"]?.trim() || tags["addr:town"]?.trim() || null,
      postcode: tags["addr:postcode"]?.trim() || null,
      phone:
        normalizePhone(tags.phone) ??
        normalizePhone(tags["contact:phone"]) ??
        normalizePhone(tags["contact:mobile"]),
      website:
        normalizeWebsite(tags.website) ??
        normalizeWebsite(tags["contact:website"]) ??
        normalizeWebsite(tags.url),
      email:
        normalizeEmail(tags.email) ?? normalizeEmail(tags["contact:email"]),
      tags,
    });

    if (results.length >= cap) {
      break;
    }
  }

  return results;
}
