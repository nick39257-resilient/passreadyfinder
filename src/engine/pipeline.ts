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
} from "./finder/fsa-finder.js";
import { resolveAuthoritiesForFind, isUkWideArea } from "./finder/find-area.js";
import { fetchEstablishmentScores } from "./finder/fsa-detail.js";
import { isRateLimited } from "./rate-limit-queue.js";
import { enrichFromOsm, sleep } from "./enrich/osm-enricher.js";
import { runPhase1EnrichmentForLead } from "./enrich/lead-enrichment-phase1.js";
import { tryEnrichLeadEmailFromWebsite, updateLeadEmail } from "./enrich/lead-email.js";
import { isExcludedLead } from "./lead-guardrails.js";

/** Venue-name filter only — runs after FSA pages are fetched; never on businessTypeNames or API params. */
function passesVenueNameGuardrail(lead: RawLead): boolean {
  return !isExcludedLead({ businessName: lead.businessName });
}
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
  deltaMode?: boolean;
  fullResync?: boolean;
  excludedByGuardrail?: number;
}

interface FetchLeadsResult {
  leads: RawLead[];
  apiRows: number;
  deltaRows: number;
  pagesFetched: number;
  excludedByGuardrail: number;
}

/**
 * Paginate FSA /Establishments per business type, apply delta-sync (RatingDate) and
 * target-rating filters client-side. See .cursor/rules/delta-sync-fsa.mdc.
 */
function matchesRatingFilter(
  rating: number | null,
  options: { worstFirst: boolean; maxRating: number; targetRating: number },
): boolean {
  if (rating === null) {
    return options.worstFirst;
  }
  if (options.worstFirst) {
    return rating <= options.maxRating;
  }
  return rating === options.targetRating;
}

function matchesPostcodePrefix(postcode: string, prefix: string | undefined): boolean {
  if (!prefix?.trim()) {
    return true;
  }
  const normalized = postcode.replace(/\s+/g, "").toUpperCase();
  const want = prefix.replace(/\s+/g, "").toUpperCase();
  return normalized.startsWith(want);
}

async function fetchLeadsWithDeltaSync(options: {
  localAuthorityId: number;
  authorityLabel: string;
  businessTypeIds: number[];
  targetRating: number;
  worstFirst: boolean;
  maxRating: number;
  postcodePrefix?: string;
  lastSyncTimestamp: string | null;
}): Promise<FetchLeadsResult> {
  const {
    localAuthorityId,
    authorityLabel,
    businessTypeIds,
    targetRating,
    worstFirst,
    maxRating,
    postcodePrefix,
    lastSyncTimestamp,
  } = options;
  const seen = new Map<number, RawLead>();
  let apiRows = 0;
  let deltaRows = 0;
  let pagesFetched = 0;
  let excludedByGuardrail = 0;

  for (const businessTypeId of businessTypeIds) {
    for await (const page of iterateEstablishmentPages(localAuthorityId, businessTypeId)) {
      pagesFetched++;
      console.log(
        `  ${authorityLabel}: page ${page.pageNumber}/${page.totalPages} (type ${businessTypeId})…`,
      );
      apiRows += page.establishments.length;

      for (const est of page.establishments) {
        if (!establishmentChangedSince(est.RatingDate, lastSyncTimestamp)) {
          continue;
        }
        deltaRows++;

        const lead = establishmentToRawLead(est);
        // Venue-name guardrails (cafe/coffee etc.) — only after FSA JSON is read; not on businessType strings.
        if (!passesVenueNameGuardrail(lead)) {
          excludedByGuardrail++;
          continue;
        }
        if (
          !matchesRatingFilter(lead.fsaRating, { worstFirst, maxRating, targetRating })
        ) {
          continue;
        }
        if (!matchesPostcodePrefix(lead.postcode, postcodePrefix)) {
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
    excludedByGuardrail,
  };
}

export async function runFindPipeline(options?: {
  skipEnrichment?: boolean;
  segmentation?: FindJobParams;
}): Promise<PipelineResult> {
  await runMigrations();

  const syncStartedAt = new Date().toISOString();
  const storedLastSync = await getLastSyncTimestamp();
  const fullResync = options?.segmentation?.fullResync === true;
  const lastSyncTimestamp = fullResync ? null : storedLastSync;

  const areaName =
    options?.segmentation?.area ??
    (productConfig.area.mode === "localAuthority"
      ? productConfig.area.localAuthorityName
      : "UK");
  const authorityNames = await resolveAuthoritiesForFind(areaName);
  if (authorityNames.length === 0) {
    throw new Error(`No local authorities resolved for area "${areaName}".`);
  }
  console.log(
    `Resolved ${authorityNames.length} FSA local authority/authorities: ${authorityNames
      .map((a) => `${a.name} (id ${a.id})`)
      .join("; ")}`,
  );

  const worstFirst = options?.segmentation?.worstFirst ?? true;
  const maxRating = productConfig.maxRating;
  const targetRating = options?.segmentation?.targetRating ?? maxRating;
  const postcodePrefix = options?.segmentation?.postcodePrefix;

  console.log("Resolving business type IDs from FSA /BusinessTypes…");
  const typeMap = await resolveBusinessTypeIds(productConfig.businessTypeNames);
  const businessTypeIds = Array.from(typeMap.values());
  console.log(
    `  Types: ${productConfig.businessTypeNames.map((n) => `${n} (${typeMap.get(n)})`).join(", ")}`,
  );

  const ratingLabel = worstFirst
    ? `worst first (≤${maxRating}★)`
    : `target ${targetRating}★`;
  const postcodeLabel = postcodePrefix ? `, postcode starts ${postcodePrefix}` : "";

  const scopeLabel = isUkWideArea(areaName)
    ? `UK (${authorityNames.length} councils)`
    : areaName;

  if (fullResync) {
    console.log(
      `Full resync: ${scopeLabel}${postcodeLabel}, ${ratingLabel} (ignoring last sync)…`,
    );
  } else if (lastSyncTimestamp) {
    console.log(
      `Delta-sync: ${scopeLabel}${postcodeLabel}, RatingDate > ${lastSyncTimestamp}, ${ratingLabel}…`,
    );
  } else {
    console.log(
      `Initial sync: ${scopeLabel}${postcodeLabel}, ${ratingLabel} (no last_sync_timestamp yet)…`,
    );
  }

  const merged = new Map<number, RawLead>();
  let apiRows = 0;
  let deltaRows = 0;
  let pagesFetched = 0;
  let excludedByGuardrail = 0;

  try {
    for (let i = 0; i < authorityNames.length; i++) {
      const authority = authorityNames[i]!;
      if (authorityNames.length > 1) {
        console.log(
          `Authority ${i + 1}/${authorityNames.length}: ${authority.name}`,
        );
      }
      const fetchResult = await fetchLeadsWithDeltaSync({
        localAuthorityId: authority.id,
        authorityLabel: authority.name,
        businessTypeIds,
        targetRating,
        worstFirst,
        maxRating,
        postcodePrefix,
        lastSyncTimestamp,
      });
      apiRows += fetchResult.apiRows;
      deltaRows += fetchResult.deltaRows;
      pagesFetched += fetchResult.pagesFetched;
      excludedByGuardrail += fetchResult.excludedByGuardrail;
      for (const lead of fetchResult.leads) {
        merged.set(lead.fsaId, lead);
      }
    }
  } catch (err) {
    console.error(
      "FSA /Establishments fetch failed — last_sync_timestamp not updated:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  const rawLeads = Array.from(merged.values());
  console.log(
    `  Done: ${pagesFetched} page(s), ${apiRows} API rows, ${deltaRows} delta rows, ${excludedByGuardrail} excluded (cafe/coffee/etc.), ${rawLeads.length} kept.`,
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

  scored.sort((a, b) => {
    const ra = a.fsaRating ?? 99;
    const rb = b.fsaRating ?? 99;
    if (ra !== rb) {
      return ra - rb;
    }
    return b.leadScore - a.leadScore;
  });

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

  if (!options?.skipEnrichment && scored.length > 0) {
    const enrichLimit =
      lastSyncTimestamp && !fullResync
        ? scored.length
        : Math.min(scored.length, productConfig.enrichTopN);
    const toEnrich = scored.slice(0, enrichLimit);
    if (scored.length > enrichLimit) {
      console.log(
        `Enriching top ${enrichLimit} of ${scored.length} lead(s) (enrichTopN cap)…`,
      );
    } else {
      console.log(`Enriching ${toEnrich.length} lead(s) via Overpass API…`);
    }

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

        const idRow = await getDb().execute({
          sql: `SELECT id, email FROM leads WHERE fsa_id = ? LIMIT 1`,
          args: [lead.fsaId],
        });
        const leadId = Number(idRow.rows[0]?.id);
        const existingEmail = String(idRow.rows[0]?.email ?? "").trim();
        if (Number.isInteger(leadId)) {
          if (osm.email && !existingEmail) {
            await updateLeadEmail(leadId, osm.email);
          }
          if (osm.website) {
            await tryEnrichLeadEmailFromWebsite(leadId, osm.website);
          }
          try {
            const phase1 = await runPhase1EnrichmentForLead(leadId, {
              allowContactForm: false,
            });
            if (phase1.enrichmentStatus === "EMAIL_FOUND") {
              process.stdout.write("+");
            } else if (phase1.contactMethod === "CONTACT_FORM") {
              process.stdout.write("f");
            }
          } catch (phaseErr) {
            console.warn(
              `\n  Phase1 enrich failed for ${lead.businessName}: ${phaseErr instanceof Error ? phaseErr.message : phaseErr}`,
            );
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
    apiRows,
    deltaRows,
    pagesFetched,
    lastSyncTimestamp: storedLastSync,
    syncTimestampUpdated: true,
    deltaMode: !fullResync && Boolean(storedLastSync),
    fullResync,
    excludedByGuardrail,
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
