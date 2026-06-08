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
import { isUkWideArea } from "./finder/find-area.js";
import {
  advanceFsaFindAuthorityCursor,
  planFsaFindAuthorityBatch,
} from "./sync/fsa-find-cursor.js";
import { fetchEstablishmentScores } from "./finder/fsa-detail.js";
import { isRateLimited } from "./rate-limit-queue.js";
import {
  enrichFromOsm,
  OSM_REQUEST_INTERVAL_MS,
  sleep,
} from "./enrich/osm-enricher.js";
import { tryEnrichLeadEmailFromWebsite, updateLeadEmail } from "./enrich/lead-email.js";
import { isExcludedLead } from "./lead-guardrails.js";

/** Venue-name filter only — runs after FSA pages are fetched; never on businessTypeNames or API params. */
function passesVenueNameGuardrail(lead: RawLead): boolean {
  return !isExcludedLead({ businessName: lead.businessName });
}
import { runPipelineLeadRecovery } from "./lead-triage.js";
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
  onProgress?: (message: string) => void | Promise<void>;
  /** Cron: slice UK authorities across runs (dashboard jobs process all). */
  authorityBatch?: boolean;
  /** Override enrichTopN cap for this run (cron uses a lower default). */
  enrichTopNOverride?: number;
  /** When false, skip updating last_sync_timestamp (partial UK batch). */
  updateSyncTimestamp?: boolean;
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
  const authorityPlan = await planFsaFindAuthorityBatch(areaName, {
    batchAll: !options?.authorityBatch,
  });
  const authorityNames = authorityPlan.authorities;
  if (authorityNames.length === 0) {
    throw new Error(`No local authorities resolved for area "${areaName}".`);
  }
  console.log(
    authorityPlan.ukWide && !authorityPlan.cycleComplete && authorityPlan.totalAuthorities > authorityNames.length
      ? `FSA batch: authorities ${authorityPlan.cursorStart + 1}-${authorityPlan.cursorEnd} of ${authorityPlan.totalAuthorities}`
      : `Resolved ${authorityNames.length} FSA local authority/authorities`,
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
    ? authorityPlan.ukWide && authorityPlan.totalAuthorities > authorityNames.length
      ? `UK batch ${authorityPlan.cursorStart + 1}-${authorityPlan.cursorEnd}/${authorityPlan.totalAuthorities}`
      : `UK (${authorityPlan.totalAuthorities} councils)`
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

  let stored = 0;
  let apiRows = 0;
  let deltaRows = 0;
  let pagesFetched = 0;
  let excludedByGuardrail = 0;
  let enriched = 0;
  let withPhone = 0;
  let withWebsite = 0;

  const enrichCap =
    options?.enrichTopNOverride ??
    (lastSyncTimestamp && !fullResync
      ? Number(process.env.FIND_DELTA_ENRICH_TOP_N) || 200
      : productConfig.enrichTopN);
  let enrichBudget = options?.skipEnrichment ? 0 : enrichCap;

  const reportProgress = async (message: string) => {
    await options?.onProgress?.(message);
  };

  const heartbeatMs = 25_000;
  const heartbeat =
    options?.onProgress &&
    setInterval(() => {
      void reportProgress(
        `FSA find running… ${stored} stored, ${pagesFetched} page(s) fetched`,
      );
    }, heartbeatMs);

  async function storeAndEnrichAuthorityLeads(rawLeads: RawLead[]): Promise<void> {
    if (rawLeads.length === 0) {
      return;
    }

    const scored = rawLeads
      .map((lead) => ({
        ...lead,
        onDeliveryApp: "unknown" as const,
        leadScore: calculateLeadScore({
          fsaRating: lead.fsaRating,
          fsaLastInspectionDate: lead.fsaLastInspectionDate,
          onDeliveryApp: "unknown",
        }),
      }))
      .sort((a, b) => {
        const ra = a.fsaRating ?? 99;
        const rb = b.fsaRating ?? 99;
        if (ra !== rb) {
          return ra - rb;
        }
        return b.leadScore - a.leadScore;
      });

    for (const lead of scored) {
      await upsertLead(lead);
      stored++;
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
      }
    }

    if (enrichBudget <= 0) {
      return;
    }

    const toEnrich = scored.slice(0, enrichBudget);
    enrichBudget -= toEnrich.length;

    for (let enrichIdx = 0; enrichIdx < toEnrich.length; enrichIdx++) {
      const lead = toEnrich[enrichIdx]!;
      if (enrichIdx % 5 === 0) {
        await reportProgress(
          `OSM ${enrichIdx + 1}/${toEnrich.length}: ${lead.businessName}…`,
        );
      }
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
        }

        enriched++;
        if (osm.phone) withPhone++;
        if (osm.website) withWebsite++;
        process.stdout.write(".");
      } catch (err) {
        console.warn(
          `\n  OSM enrichment step failed for ${lead.businessName}: ${err instanceof Error ? err.message : err}`,
        );
      }

      await sleep(OSM_REQUEST_INTERVAL_MS);
    }
  }

  try {
    await reportProgress(`Processing ${authorityNames.length} local authority/authorities…`);

    for (let i = 0; i < authorityNames.length; i++) {
      const authority = authorityNames[i]!;
      await reportProgress(
        `FSA ${authorityPlan.cursorStart + i + 1}/${authorityPlan.totalAuthorities}: ${authority.name}…`,
      );
      if (authorityNames.length > 1 || authorityPlan.totalAuthorities > 1) {
        console.log(
          `Authority ${authorityPlan.cursorStart + i + 1}/${authorityPlan.totalAuthorities}: ${authority.name}`,
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
      await storeAndEnrichAuthorityLeads(fetchResult.leads);
    }
  } catch (err) {
    console.error(
      "FSA /Establishments fetch failed — last_sync_timestamp not updated:",
      err instanceof Error ? err.message : err,
    );
    throw err;
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    await runPipelineLeadRecovery();
  }

  console.log(
    `  Done: ${pagesFetched} page(s), ${apiRows} API rows, ${deltaRows} delta rows, ${excludedByGuardrail} excluded (cafe/coffee/etc.), ${stored} stored.`,
  );
  if (enriched > 0) {
    console.log(`  Enriched ${enriched} lead(s) via OSM.`);
  }

  const shouldUpdateSync = options?.updateSyncTimestamp !== false && authorityPlan.cycleComplete;
  if (shouldUpdateSync) {
    await setLastSyncTimestamp(syncStartedAt);
    console.log(`  Updated last_sync_timestamp → ${syncStartedAt}`);
    if (authorityPlan.ukWide) {
      await advanceFsaFindAuthorityCursor(authorityPlan);
    }
  } else if (authorityPlan.ukWide && options?.authorityBatch) {
    await advanceFsaFindAuthorityCursor(authorityPlan);
    console.log(
      `  UK batch complete — cursor now ${authorityPlan.cycleComplete ? 0 : authorityPlan.cursorEnd}/${authorityPlan.totalAuthorities} (sync timestamp unchanged until full cycle).`,
    );
  }

  return {
    fetched: stored,
    stored,
    enriched,
    withPhone,
    withWebsite,
    apiRows,
    deltaRows,
    pagesFetched,
    lastSyncTimestamp: storedLastSync,
    syncTimestampUpdated: shouldUpdateSync,
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
