export interface DraftEnvStatus {
  ok: boolean;
  missing: string[];
}

/** Validates env vars required to call Gemini for drafts. */
export function checkDraftEnv(): DraftEnvStatus {
  const missing: string[] = [];

  if (!process.env.OPENAI_API_KEY?.trim()) {
    missing.push("OPENAI_API_KEY");
  }
  if (!process.env.OPENAI_BASE_URL?.trim()) {
    missing.push("OPENAI_BASE_URL");
  }

  return { ok: missing.length === 0, missing };
}

export function assertDraftEnv(): void {
  const status = checkDraftEnv();
  if (!status.ok) {
    throw new Error(
      `Drafting not configured — set: ${status.missing.join(", ")}`,
    );
  }
}
