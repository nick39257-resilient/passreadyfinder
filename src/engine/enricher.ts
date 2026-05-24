import "dotenv/config";
import { productConfig } from "../config/product.config.js";
import { runMigrations, closeDb } from "./store/db.js";
import {
  getLeadsNeedingPhone,
  updateLeadContact,
  type LeadNeedingPhone,
} from "./store/enricher-repository.js";

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress";
const DELAY_MS = 2000;

interface GooglePlace {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
}

interface GoogleSearchResponse {
  places?: GooglePlace[];
}

function searchCity(): string {
  const area = productConfig.area;
  if (area.mode === "localAuthority") {
    return `${area.localAuthorityName}, UK`;
  }
  return "UK";
}

function buildTextQuery(lead: LeadNeedingPhone): string {
  return `${lead.business_name} ${searchCity()}`;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickBestPlace(places: GooglePlace[], lead: LeadNeedingPhone): GooglePlace | null {
  if (places.length === 0) {
    return null;
  }

  const target = normalizeName(lead.business_name);
  let best = places[0];
  let bestScore = -1;

  for (const place of places) {
    const name = normalizeName(place.displayName?.text ?? "");
    let score = 0;
    if (name === target) {
      score += 100;
    } else if (name.includes(target) || target.includes(name)) {
      score += 50;
    }
    if (place.nationalPhoneNumber) {
      score += 10;
    }
    if (place.websiteUri) {
      score += 5;
    }
    if (lead.postcode && place.formattedAddress?.includes(lead.postcode)) {
      score += 15;
    }
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }

  return best;
}

async function searchGooglePlaces(
  apiKey: string,
  textQuery: string,
): Promise<GooglePlace[]> {
  const response = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      regionCode: "GB",
      languageCode: "en",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Places API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as GoogleSearchResponse;
  return data.places ?? [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EnrichRunResult {
  processed: number;
  enriched: number;
  notFound: number;
  errors: { leadId: number; businessName: string; error: string }[];
}

export async function runPlacesEnricher(): Promise<EnrichRunResult> {
  await runMigrations();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is required in .env");
  }

  const leads = await getLeadsNeedingPhone();
  const result: EnrichRunResult = {
    processed: 0,
    enriched: 0,
    notFound: 0,
    errors: [],
  };

  if (leads.length === 0) {
    console.log("No leads with phone IS NULL.");
    return result;
  }

  console.log(`Enriching ${leads.length} lead(s) via Google Places API…\n`);

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    result.processed++;
    const query = buildTextQuery(lead);

    try {
      console.log(`→ ${lead.business_name}`);
      console.log(`  query: ${query}`);

      const places = await searchGooglePlaces(apiKey, query);
      const match = pickBestPlace(places, lead);

      if (!match) {
        result.notFound++;
        console.log("  — not found on Google\n");
        continue;
      }

      const phone = match.nationalPhoneNumber?.trim() ?? null;
      const website = match.websiteUri?.trim() ?? null;

      if (!phone && !website) {
        result.notFound++;
        console.log("  — found listing but no phone or website\n");
        continue;
      }

      await updateLeadContact(lead.id, phone, website);
      result.enriched++;
      console.log(`  ✓ phone: ${phone ?? "—"}`);
      console.log(`    web:   ${website ?? "—"}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      console.error(`  ✗ ${message}\n`);
    }

    if (i < leads.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return result;
}

async function main(): Promise<void> {
  try {
    const result = await runPlacesEnricher();
    console.log("---");
    console.log(`Processed: ${result.processed}`);
    console.log(`Enriched:  ${result.enriched}`);
    console.log(`Not found: ${result.notFound}`);
    if (result.errors.length > 0) {
      console.log(`Errors:    ${result.errors.length}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
