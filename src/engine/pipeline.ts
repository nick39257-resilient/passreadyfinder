import { productConfig } from "../config/product.config.js";
import type { FindJobParams } from "../types/segmentation.js";
import {
  findEstablishments,
  resolveBusinessTypeIds,
} from "./finder/fsa-finder.js";
import { enrichFromOsm, sleep } from "./enrich/osm-enricher.js";
import { calculateLeadScore } from "./score/scorer.js";
import { runMigrations } from "./store/db.js";
import {
  countLeads,
  getTopLeads,
  upsertLead,
  updateLeadEnrichment,
} from "./store/leads-repository.js";

export interface PipelineResult {
  fetched: number;
  stored: number;
  enriched: number;
  withPhone: number;
  withWebsite: number;
}

export async function runFindPipeline(options?: {
  skipEnrichment?: boolean;
  segmentation?: FindJobParams;
}): Promise<PipelineResult> {
  await runMigrations();

  const areaName =
    options?.segmentation?.area ??
    (productConfig.area.mode === "localAuthority"
      ? productConfig.area.localAuthorityName
      : "Preston");
  const targetRating = options?.segmentation?.targetRating ?? 2;

  console.log("Resolving business type IDs from FSA /BusinessTypes…");
  const typeMap = await resolveBusinessTypeIds(productConfig.businessTypeNames);
  const businessTypeIds = Array.from(typeMap.values());
  console.log(
    `  Types: ${productConfig.businessTypeNames.map((n) => `${n} (${typeMap.get(n)})`).join(", ")}`,
  );

  console.log(`Finding establishments in ${areaName} with ${targetRating}★ FSA rating…`);

  const rawLeads = await findEstablishments({
    businessTypeIds,
    localAuthorityName: areaName,
    targetRating,
  });
  console.log(`  Found ${rawLeads.length} matching leads from FSA.`);

  const scored = rawLeads.map((lead) => ({
    ...lead,
    onDeliveryApp: "unknown" as const,
    leadScore: calculateLeadScore({
      fsaRating: lead.fsaRating,
      fsaLastInspectionDate: lead.fsaLastInspectionDate,
      onDeliveryApp: "unknown",
    }),
  }));

  scored.sort((a, b) => b.leadScore - a.leadScore);

  for (const lead of scored) {
    await upsertLead(lead);
  }
  console.log(`  Stored ${scored.length} leads (idempotent upsert on fsa_id).`);

  let enriched = 0;
  let withPhone = 0;
  let withWebsite = 0;

  if (!options?.skipEnrichment) {
    const toEnrich = scored.slice(0, productConfig.enrichTopN);
    console.log(`Enriching top ${toEnrich.length} leads via Overpass API…`);

    for (const lead of toEnrich) {
      try {
        const osm = await enrichFromOsm({
          fsaId: lead.fsaId,
          businessName: lead.businessName,
          latitude: lead.latitude,
          longitude: lead.longitude,
        });

        const leadScore = calculateLeadScore({
          fsaRating: lead.fsaRating,
          fsaLastInspectionDate: lead.fsaLastInspectionDate,
          onDeliveryApp: osm.onDeliveryApp,
        });

        await updateLeadEnrichment(lead.fsaId, {
          phone: osm.phone,
          website: osm.website,
          onDeliveryApp: osm.onDeliveryApp,
          leadScore,
        });

        enriched++;
        if (osm.phone) withPhone++;
        if (osm.website) withWebsite++;

        process.stdout.write(".");
      } catch (err) {
        console.warn(
          `\n  OSM lookup failed for ${lead.businessName}: ${err instanceof Error ? err.message : err}`,
        );
      }

      await sleep(productConfig.osm.requestDelayMs);
    }
    console.log("\n  Enrichment complete.");
  }

  return {
    fetched: rawLeads.length,
    stored: scored.length,
    enriched,
    withPhone,
    withWebsite,
  };
}

export async function printLeadSummary(limit = 20): Promise<void> {
  const total = await countLeads();
  const leads = await getTopLeads(limit);

  console.log(`\nTop ${Math.min(limit, leads.length)} leads (of ${total} total):\n`);
  console.log(
    "Score".padEnd(6) +
      "Rating".padEnd(8) +
      "Phone".padEnd(16) +
      "Name".padEnd(30) +
      "Postcode",
  );
  console.log("-".repeat(80));

  for (const lead of leads) {
    const phone = lead.phone ? lead.phone.slice(0, 14) : "—";
    console.log(
      String(lead.lead_score).padEnd(6) +
        String(lead.fsa_rating ?? "—").padEnd(8) +
        phone.padEnd(16) +
        lead.business_name.slice(0, 28).padEnd(30) +
        lead.postcode,
    );
  }
}
