import { z } from "zod";

export const LOCAL_AUTHORITY_FALLBACK = "the local council health inspectors";

const INVALID_AUTHORITY_VALUES = new Set(["uk", "unknown", "n/a", "na", ""]);

/** Validates FSA local authority names at the drafter boundary. */
export const localAuthorityNameSchema = z
  .string()
  .trim()
  .min(2, "Authority name too short")
  .max(120, "Authority name too long")
  .refine((value) => !value.includes("{{") && !value.includes("}}"), {
    message: "Authority name contains template tokens",
  })
  .refine((value) => !INVALID_AUTHORITY_VALUES.has(value.toLowerCase()), {
    message: "Authority name is a placeholder",
  });

export function sanitizeLocalAuthorityName(raw: string | null | undefined): string {
  const parsed = localAuthorityNameSchema.safeParse(raw ?? "");
  if (parsed.success) {
    return parsed.data;
  }
  return LOCAL_AUTHORITY_FALLBACK;
}
