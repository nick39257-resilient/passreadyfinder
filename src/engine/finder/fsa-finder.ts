import type { FsaEstablishment, RawLead } from "../../types/fsa.js";
import { productConfig } from "../../config/product.config.js";
import {
  fsaAuthoritiesResponseSchema,
  fsaBusinessTypesResponseSchema,
  fsaEstablishmentsResponseSchema,
} from "../../validation/fsa.schemas.js";
import { fsaFetch } from "./fsa-http.js";

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

export function establishmentToRawLead(e: FsaEstablishment): RawLead {
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

export interface EstablishmentsPage {
  pageNumber: number;
  totalPages: number;
  establishments: FsaEstablishment[];
}

/** Paginate the standard FSA /Establishments endpoint (full detail rows). */
export async function* iterateEstablishmentPages(
  localAuthorityId: number,
  businessTypeId: number,
): AsyncGenerator<EstablishmentsPage> {
  const params = { localAuthorityId, businessTypeId };
  const first = await fetchEstablishmentsPage(params, 1);
  yield {
    pageNumber: 1,
    totalPages: first.meta.totalPages,
    establishments: first.establishments,
  };

  for (let page = 2; page <= first.meta.totalPages; page++) {
    const next = await fetchEstablishmentsPage(params, page);
    yield {
      pageNumber: page,
      totalPages: next.meta.totalPages,
      establishments: next.establishments,
    };
  }
}
