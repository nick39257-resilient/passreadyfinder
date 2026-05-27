import { productConfig } from "../config/product.config.js";
import {
  establishmentChangedSince,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from "./sync/fsa-sync-state.js";
import type { FindJobParams } from "../types/segmentation.js";
import type { RawLead } from "../types/fsa.js";
import {
  establishmentToRawLead,
  iterateEstablishmentPages,
  resolveBusinessTypeIds,
  resolveLocalAuthorityId,
} from "./finder/fsa-finder.js";
import { fetchEstablishmentScores } from "./finder/fsa-detail.js";
import { isRateLimited } from "./rate-limit-queue.js";
import { enrichFromOsm, sleep } from "./enrich/osm-enricher.js";
import { tryEnrichLeadEmailFromWebsite } from "./enrich/lead-email.js";
import { calculateLeadScore } from "./score/scorer.js";
import { getDb, runMigrations } from "./store/db.js";
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
  /** FSA rows returned across all /Establishments pages */
  apiRows: number;
  /** Rows passing RatingDate > last_sync_timestamp */
  deltaRows: number;
  /** Total /Establishments pages fetched */
  pagesFetched: number;
  lastSyncTimestamp: string | null;
  syncTimestampUpdated: boolean;
}

interface FetchLeadsResult {
  leads: RawLead[];
  apiRows: number;
  deltaRows: number;
  pagesFetched: number;
}

/**
 * Paginate FSA /Establishments per business type, apply delta-sync (RatingDate) and
 * target-rating filters client-side. See .cursor/rules/delta-sync-fsa.mdc.
 */
async function fetchLeadsWithDeltaSync(options: {
  localAuthorityName: string;
  businessTypeIds: number[];
  targetRating: number;
  lastSyncTimestamp: string | null;
}): Promise<FetchLeadsResult> {
  const { localAuthorityName, businessTypeIds, targetRating, lastSyncTimestamp } =
    options;
  const localAuthorityId = await resolveLocalAuthorityId(localAuthorityName);
  const seen = new Map<number, RawLead>();
  let apiRows = 0;
  let deltaRows = 0;
  let pagesFetched = 0;

  for (const businessTypeId of businessTypeIds) {
    for await (const page of iterateEstablishmentPages(localAuthorityId, businessTypeId)) {
      pagesFetched++;
      console.log(
        `  /Establishments page ${page.pageNumber}/${page.totalPages} (type ${businessTypeId})…`,
      );
      apiRows += page.establishments.length;

      for (const est of page.establishments) {
        if (!establishmentChangedSince(est.RatingDate, lastSyncTimestamp)) {
          continue;
        }
        deltaRows++;

        const lead = establishmentToRawLead(est);
        if (lead.fsaRating !== targetRating) {
          continue;
        }
        seen.set(lead.fsaId, lead);
      }
    }
  }

  return {
    leads: Array.from(seen.values()),
    apiRows,
    deltaRows,
    pagesFetched,
  };
}

export async function runFindPipeline(options?: {
  skipEnrichment?: boolean;
  segmentation?: FindJobParams;
}): Promise<PipelineResult> {
  await runMigrations();

  const syncStartedAt = new Date().toISOString();
  const lastSyncTimestamp = await getLastSyncTimestamp();

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

  if (lastSyncTimestamp) {
    console.log(
      `Delta-sync: ${areaName}, RatingDate > ${lastSyncTimestamp}, target ${targetRating}★…`,
    );
  } else {
    console.log(
      `Initial sync: ${areaName}, target ${targetRating}★ (no last_sync_timestamp yet)…`,
    );
  }

  let fetchResult: FetchLeadsResult;
  try {
    fetchResult = await fetchLeadsWithDeltaSync({
      localAuthorityName: areaName,
      businessTypeIds,
      targetRating,
      lastSyncTimestamp,
    });
  } catch (err) {
    console.error(
      "FSA /Establishments fetch failed — last_sync_timestamp not updated:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  const rawLeads = fetchResult.leads;
  console.log(
    `  Done: ${fetchResult.pagesFetched} page(s), ${fetchResult.apiRows} API rows, ${fetchResult.deltaRows} delta rows, ${rawLeads.length} match target rating.`,
  );

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
    try {
      const scores = await fetchEstablishmentScores(lead.fsaId);
      if (scores) {
        const db = getDb();
        await db.execute({
          sql: `UPDATE leads SET fsa_score_hygiene = ?, fsa_score_structural = ?, fsa_score_management = ? WHERE fsa_id = ?`,
          args: [
            scores.hygiene,
            scores.structural,
            scores.management,
            lead.fsaId,
          ],
        });
      }
    } catch (err) {
      if (isRateLimited(err)) {
        console.warn(
          `  FSA sub-scores skipped for ${lead.businessName} (rate limit after retries)`,
        );
      }
      /* other errors — FHIS/rescore may omit scores */
    }
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

        if (osm.website) {
          const idRow = await getDb().execute({
            sql: `SELECT id FROM leads WHERE fsa_id = ? LIMIT 1`,
            args: [lead.fsaId],
          });
          const leadId = Number(idRow.rows[0]?.id);
          if (Number.isInteger(leadId)) {
            await tryEnrichLeadEmailFromWebsite(leadId, osm.website);
          }
        }

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

  await setLastSyncTimestamp(syncStartedAt);
  console.log(`  Updated last_sync_timestamp → ${syncStartedAt}`);

  return {
    fetched: rawLeads.length,
    stored: scored.length,
    enriched,
    withPhone,
    withWebsite,
    apiRows: fetchResult.apiRows,
    deltaRows: fetchResult.deltaRows,
    pagesFetched: fetchResult.pagesFetched,
    lastSyncTimestamp,
    syncTimestampUpdated: true,
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
