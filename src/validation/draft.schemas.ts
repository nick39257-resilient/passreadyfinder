import { z } from "zod";
import { containsUrl } from "../engine/outreach-message.js";

const MAX_DRAFT_WORDS = 125;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const wordLimitRefine = {
  refine: (text: string) => wordCount(text) <= MAX_DRAFT_WORDS,
  message: `Draft exceeds ${MAX_DRAFT_WORDS} words`,
} as const;

/** Validates consultant-style draft body at the engine boundary. */
export const draftMessageSchema = z
  .string()
  .min(1, "Draft is empty")
  .refine(wordLimitRefine.refine, { message: wordLimitRefine.message });

/** First-touch drafts must be link-free (spam filters). */
export const firstTouchDraftMessageSchema = draftMessageSchema.refine(
  (text) => !containsUrl(text),
  { message: "First-touch draft must not contain URLs or links" },
);

export { MAX_DRAFT_WORDS, wordCount };
