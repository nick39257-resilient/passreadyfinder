import type {
  FsaAuthoritiesResponse,
  FsaBusinessTypesResponse,
  FsaEstablishment,
  FsaEstablishmentsResponse,
  RawLead,
} from "../../types/fsa.js";
import { productConfig } from "../../config/product.config.js";

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
  return response.json() as Promise<T>;
}

export async function resolveBusinessTypeIds(names: readonly string[]): Promise<Map<string, number>> {
  const data = await fsaFetch<FsaBusinessTypesResponse>("/BusinessTypes");
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
  const data = await fsaFetch<FsaAuthoritiesResponse>("/Authorities/basic");
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
): Promise<FsaEstablishmentsResponse> {
  return fsaFetch<FsaEstablishmentsResponse>("/Establishments", {
    ...params,
    pageNumber,
    pageSize: productConfig.fsa.pageSize,
  });
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
  maxRating: number;
}

export async function findEstablishments(options: FinderOptions): Promise<RawLead[]> {
  const { businessTypeIds, maxRating } = options;
  const area = productConfig.area;
  const seen = new Map<number, RawLead>();

  for (const businessTypeId of businessTypeIds) {
    let params: Record<string, string | number>;

    if (area.mode === "localAuthority") {
      const localAuthorityId = await resolveLocalAuthorityId(area.localAuthorityName);
      params = { localAuthorityId, businessTypeId };
    } else if (area.mode === "radius") {
      params = {
        latitude: area.latitude,
        longitude: area.longitude,
        maxDistanceLimit: area.radiusMetres,
        businessTypeId,
      };
    } else {
      throw new Error("Invalid area config");
    }

    const establishments = await fetchAllPages(params);

    for (const est of establishments) {
      const lead = establishmentToRawLead(est);
      if (lead.fsaRating === null || lead.fsaRating > maxRating) {
        continue;
      }
      seen.set(lead.fsaId, lead);
    }
  }

  return Array.from(seen.values());
}
