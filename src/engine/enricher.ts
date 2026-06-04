import "dotenv/config";
import { productConfig } from "../config/product.config.js";
import { enrichFromOsm, sleep } from "./enrich/osm-enricher.js";
import { tryEnrichLeadEmailFromWebsite, updateLeadEmail } from "./enrich/lead-email.js";
import { getLeadById } from "./store/leads-repository.js";
import { runMigrations, closeDb } from "./store/db.js";
import { getOsmCache } from "./store/leads-repository.js";
import {
  getLeadsNeedingPhone,
  updateLeadContact,
} from "./store/enricher-repository.js";

const DELAY_MS = productConfig.osm.requestDelayMs;

export interface EnrichRunResult {
  processed: number;
  enriched: number;
  notFound: number;
  cached: number;
  errors: { leadId: number; businessName: string; error: string }[];
}

/** Sweep leads missing phone/website via Overpass API (cached in osm_cache). */
export async function runOsmEnricher(): Promise<EnrichRunResult> {
  await runMigrations();

  const leads = await getLeadsNeedingPhone();
  const result: EnrichRunResult = {
    processed: 0,
    enriched: 0,
    notFound: 0,
    cached: 0,
    errors: [],
  };

  if (leads.length === 0) {
    console.log("No leads with phone IS NULL.");
    return result;
  }

  console.log(`Enriching ${leads.length} lead(s) via Overpass API (OpenStreetMap)…\n`);

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    result.processed++;
    let wasCached = false;

    try {
      console.log(`→ ${lead.business_name}`);

      wasCached = (await getOsmCache(lead.fsa_id)) !== null;

      const osm = await enrichFromOsm({
        fsaId: lead.fsa_id,
        businessName: lead.business_name,
        latitude: lead.latitude,
        longitude: lead.longitude,
      });

      if (wasCached) {
        result.cached++;
      }

      const phone = osm.phone;
      const website = osm.website;

      if (!phone && !website) {
        result.notFound++;
        console.log("  — no phone or website in OSM\n");
      } else {
        await updateLeadContact(lead.id, phone, website);
        const current = await getLeadById(lead.id);
        if (osm.email && !current?.email?.trim()) {
          await updateLeadEmail(lead.id, osm.email);
        }
        const email = website ? await tryEnrichLeadEmailFromWebsite(lead.id, website) : null;
        result.enriched++;
        console.log(`  ✓ phone: ${phone ?? "—"}`);
        console.log(`    web:   ${website ?? "—"}`);
        console.log(`    email: ${email ?? "—"}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      console.error(`  ✗ ${message}\n`);
    }

    if (i < leads.length - 1 && !wasCached) {
      await sleep(DELAY_MS);
    }
  }

  return result;
}

async function main(): Promise<void> {
  try {
    const result = await runOsmEnricher();
    console.log("---");
    console.log(`Processed: ${result.processed}`);
    console.log(`Enriched:  ${result.enriched}`);
    console.log(`Cached:    ${result.cached}`);
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
