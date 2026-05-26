export const TARGET_RATINGS = [2, 3, 4, 5] as const;
export type TargetRating = (typeof TARGET_RATINGS)[number];

export interface FindJobParams {
  area: string;
  targetRating: TargetRating;
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
