export const TARGET_RATINGS = [2, 3, 4, 5] as const;
export type TargetRating = (typeof TARGET_RATINGS)[number];

export interface FindJobParams {
  area: string;
  /** When omitted with worstFirst, uses ratings 0…product maxRating (worst first). */
  targetRating?: TargetRating;
  /** Optional UK postcode outward filter, e.g. PR1 or BB1. */
  postcodePrefix?: string;
  /** Fetch lowest FSA ratings in the area (default true from Command Center). */
  worstFirst?: boolean;
}

export function parsePostcodePrefix(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toUpperCase().replace(/\s+/g, "");
  if (trimmed.length < 2 || trimmed.length > 8) {
    return null;
  }
  return trimmed;
}

export interface DraftJobParams {
  targetRating?: TargetRating;
  /** QueueDrafter batch size override (default from product.config). */
  batchSize?: number;
}

export function parseTargetRating(value: unknown): TargetRating | null {
  const n = Number(value);
  if (n === 2 || n === 3 || n === 4 || n === 5) {
    return n;
  }
  return null;
}

export function parseArea(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length >= 2 ? trimmed : null;
}
