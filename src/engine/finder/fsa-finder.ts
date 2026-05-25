import type { FsaEstablishment, RawLead } from "../../types/fsa.js";
import { productConfig } from "../../config/product.config.js";
import {
  fsaAuthoritiesResponseSchema,
  fsaBusinessTypesResponseSchema,
  fsaEstablishmentsResponseSchema,
} from "../../validation/fsa.schemas.js";
import { establishmentChangedSince } from "../sync/fsa-sync-state.js";

const FSA_HEADERS = {
  "x-api-version": "2",
  Accept: "application/json",
};

function fsaUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, productConfig.fsa.baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fsaFetch<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const response = await fetch(fsaUrl(path, params), { headers: FSA_HEADERS });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FSA API error ${response.status} for ${path}: ${body}`);
  }
  const json: unknown = await response.json();
  return json as T;
}

function parseFsaResponse<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  return schema.parse(data);
}

export async function resolveBusinessTypeIds(names: readonly string[]): Promise<Map<string, number>> {
  const raw = await fsaFetch<unknown>("/BusinessTypes");
  const data = parseFsaResponse(fsaBusinessTypesResponseSchema, raw);
  const map = new Map<string, number>();
  for (const name of names) {
    const match = data.businessTypes.find(
      (bt) => bt.BusinessTypeName.toLowerCase() === name.toLowerCase(),
    );
    if (!match) {
      throw new Error(
        `Business type "${name}" not found in FSA /BusinessTypes. Available types include: ${data.businessTypes
          .slice(0, 5)
          .map((b) => b.BusinessTypeName)
          .join(", ")}…`,
      );
    }
    map.set(name, match.BusinessTypeId);
  }
  return map;
}

export async function resolveLocalAuthorityId(name: string): Promise<number> {
  const raw = await fsaFetch<unknown>("/Authorities/basic");
  const data = parseFsaResponse(fsaAuthoritiesResponseSchema, raw);
  const match = data.authorities.find((a) => a.Name.toLowerCase() === name.toLowerCase());
  if (!match) {
    throw new Error(`Local authority "${name}" not found in FSA /Authorities/basic`);
  }
  return match.LocalAuthorityId;
}

/** Parse FSA RatingValue defensively — Scotland Pass/Improvement etc. return null */
export function parseFsaRating(ratingValue: string): number | null {
  const trimmed = ratingValue?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const n = parseInt(trimmed, 10);
  if (n < 0 || n > 5) {
    return null;
  }
  return n;
}

function buildAddress(e: FsaEstablishment): string {
  return [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4]
    .filter((line) => line?.trim())
    .join(", ");
}

function establishmentToRawLead(e: FsaEstablishment): RawLead {
  return {
    fsaId: e.FHRSID,
    businessName: e.BusinessName.trim(),
    businessType: e.BusinessType,
    address: buildAddress(e),
    postcode: e.PostCode?.trim() ?? "",
    latitude: parseFloat(e.geocode?.latitude ?? "0"),
    longitude: parseFloat(e.geocode?.longitude ?? "0"),
    fsaRating: parseFsaRating(e.RatingValue),
    fsaLastInspectionDate: e.RatingDate ? e.RatingDate.split("T")[0] : null,
  };
}

async function fetchEstablishmentsPage(
  params: Record<string, string | number>,
  pageNumber: number,
): Promise<ReturnType<typeof fsaEstablishmentsResponseSchema.parse>> {
  const raw = await fsaFetch<unknown>("/Establishments", {
    ...params,
    pageNumber,
    pageSize: productConfig.fsa.pageSize,
  });
  return parseFsaResponse(fsaEstablishmentsResponseSchema, raw);
}

async function fetchAllPages(params: Record<string, string | number>): Promise<FsaEstablishment[]> {
  const first = await fetchEstablishmentsPage(params, 1);
  const all = [...first.establishments];

  for (let page = 2; page <= first.meta.totalPages; page++) {
    const next = await fetchEstablishmentsPage(params, page);
    all.push(...next.establishments);
  }

  return all;
}

export interface FinderOptions {
  businessTypeIds: number[];
  localAuthorityName: string;
  /** Exact FSA star rating to match (2, 3, 4, or 5) */
  targetRating: number;
  /** ISO timestamp — only include establishments with RatingDate newer than this (delta-sync) */
  lastSyncTimestamp?: string | null;
}

export interface FindEstablishmentsResult {
  leads: RawLead[];
  /** Total establishments returned from FSA pagination (before filters) */
  apiRows: number;
  /** Rows passing delta-sync (RatingDate > lastSyncTimestamp) */
  deltaRows: number;
}

export async function findEstablishments(
  options: FinderOptions,
): Promise<FindEstablishmentsResult> {
  const { businessTypeIds, localAuthorityName, targetRating, lastSyncTimestamp } =
    options;
  const seen = new Map<number, RawLead>();
  const localAuthorityId = await resolveLocalAuthorityId(localAuthorityName);
  let apiRows = 0;
  let deltaRows = 0;

  for (const businessTypeId of businessTypeIds) {
    const params = { localAuthorityId, businessTypeId };
    const establishments = await fetchAllPages(params);
    apiRows += establishments.length;

    for (const est of establishments) {
      if (
        lastSyncTimestamp &&
        !establishmentChangedSince(est.RatingDate, lastSyncTimestamp)
      ) {
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

  return { leads: Array.from(seen.values()), apiRows, deltaRows };
}
