/**
 * Drafting-only Gemini model id (OpenAI-compatible API).
 * Override with GEMINI_DRAFT_MODEL — see https://ai.google.dev/gemini-api/docs/models
 */
const DEFAULT_GEMINI_DRAFT_MODEL = "gemini-3.1-flash-lite";

export function getGeminiDraftModel(): string {
  const fromEnv = process.env.GEMINI_DRAFT_MODEL?.trim();
  return fromEnv || DEFAULT_GEMINI_DRAFT_MODEL;
}
