import { z } from "zod";

const MAX_DRAFT_WORDS = 125;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Validates consultant-style draft body at the engine boundary. */
export const draftMessageSchema = z
  .string()
  .min(1, "Draft is empty")
  .refine((text) => wordCount(text) <= MAX_DRAFT_WORDS, {
    message: `Draft exceeds ${MAX_DRAFT_WORDS} words`,
  });

export { MAX_DRAFT_WORDS, wordCount };
