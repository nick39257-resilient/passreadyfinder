import { fsaAuthoritiesResponseSchema } from "../../validation/fsa.schemas.js";
import { fsaFetch } from "./fsa-http.js";

export interface FsaAuthority {
  LocalAuthorityId: number;
  Name: string;
}

export async function fetchAuthorities(): Promise<FsaAuthority[]> {
  const raw = await fsaFetch<unknown>("/Authorities/basic");
  const data = fsaAuthoritiesResponseSchema.parse(raw);
  return data.authorities.map((a) => ({
    LocalAuthorityId: a.LocalAuthorityId,
    Name: a.Name,
  }));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function resolveLocalAuthorityIdLoose(
  input: string,
): Promise<{ id: number; name: string }> {
  const wanted = normalizeName(input);
  const authorities = await fetchAuthorities();

  const exact = authorities.find((a) => normalizeName(a.Name) === wanted);
  if (exact) {
    return { id: exact.LocalAuthorityId, name: exact.Name };
  }

  const contains = authorities.filter((a) => normalizeName(a.Name).includes(wanted));
  if (contains.length === 1) {
    return { id: contains[0].LocalAuthorityId, name: contains[0].Name };
  }

  const starts = authorities.filter((a) => normalizeName(a.Name).startsWith(wanted));
  if (starts.length === 1) {
    return { id: starts[0].LocalAuthorityId, name: starts[0].Name };
  }

  const suggestions = [...contains, ...starts]
    .map((a) => a.Name)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .slice(0, 12);

  if (suggestions.length > 0) {
    throw new Error(
      `Area "${input}" didn't match a single FSA local authority. Try one of: ${suggestions.join(
        ", ",
      )}`,
    );
  }

  throw new Error(
    `Local authority "${input}" not found. Use the Command Center picker to select a valid FSA authority.`,
  );
}

