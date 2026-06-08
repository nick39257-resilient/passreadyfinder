import { z } from "zod";
import { containsUrl, isFirstTouchDraftValid } from "../engine/outreach-message.js";

export const MAX_DRAFT_WORDS = 60;

const MOBILE_SIGNATURE_PATTERNS = [
  /\nSent from my iPhone\s*$/i,
  /\nTyped on the go, please excuse typos\s*$/i,
];

const BANNED_FORMAL_WORDS = [
  "compliance",
  "optimization",
  "optimisation",
  "urgency",
  "solutions",
  "solution",
  "fsa pressure",
  "leverage",
  "synergy",
  "streamline",
  "implement",
  "utilize",
  "utilise",
  "facilitate",
  "enterprise",
  "deliverable",
] as const;

/** Strip mobile footer before counting words — signature is appended after validation. */
export function stripMobileSignature(text: string): string {
  let out = text.trim();
  for (const pattern of MOBILE_SIGNATURE_PATTERNS) {
    out = out.replace(pattern, "");
  }
  return out.trim();
}

export function wordCount(text: string): number {
  return stripMobileSignature(text).split(/\s+/).filter(Boolean).length;
}

function hasBannedFormalLanguage(text: string): boolean {
  const lower = stripMobileSignature(text).toLowerCase();
  return BANNED_FORMAL_WORDS.some((word) => lower.includes(word));
}

const wordLimitRefine = {
  refine: (text: string) => wordCount(text) <= MAX_DRAFT_WORDS,
  message: `Draft exceeds ${MAX_DRAFT_WORDS} words`,
} as const;

const casualToneRefine = {
  refine: (text: string) => !hasBannedFormalLanguage(text),
  message: `Draft uses banned formal language (${BANNED_FORMAL_WORDS.slice(0, 5).join(", ")}, …)`,
} as const;

/** Validates casual peer-style draft body at the engine boundary. */
export const draftMessageSchema = z
  .string()
  .min(1, "Draft is empty")
  .refine(wordLimitRefine.refine, { message: wordLimitRefine.message })
  .refine(casualToneRefine.refine, { message: casualToneRefine.message });

/** Touch 1: strictly link-free — maximizes reply rate. */
export const firstTouchDraftMessageSchema = draftMessageSchema.refine(
  (text) => !containsUrl(stripMobileSignature(text)),
  {
    message: "Touch 1 draft must not contain any URLs or wa.me links",
  },
);

/** Touch 2–3: must include at least one CTA link (SafeScore or WhatsApp). */
export function followUpDraftMessageSchema(requiredUrl: string) {
  const normalized = requiredUrl.trim();
  return draftMessageSchema.refine(
    (text) => {
      const body = stripMobileSignature(text);
      return body.includes(normalized) || /\bwa\.me\/\S+/i.test(body);
    },
    {
      message: "Follow-up draft must include the SafeScore or WhatsApp CTA link",
    },
  );
}

/** Touch 4: breakup — no links required, must signal final attempt. */
export const breakupDraftMessageSchema = draftMessageSchema.refine(
  (text) => /\b(last|final)\b/i.test(stripMobileSignature(text)),
  {
    message: "Breakup draft must explicitly state this is the last/final outreach attempt",
  },
);

/** Legacy helper — first-touch with optional landing when env allows. */
export const legacyFirstTouchDraftMessageSchema = draftMessageSchema.refine(
  (text) => isFirstTouchDraftValid(stripMobileSignature(text)),
  {
    message:
      "First-touch draft must not contain URLs (or only the SafeScore landing URL when OUTREACH_FIRST_TOUCH_LINK is enabled)",
  },
);

export { BANNED_FORMAL_WORDS };
