import { z } from "zod";
import { productConfig } from "../../config/product.config.js";
import type { FsaBreakdownScores } from "../intelligence/carrot.js";
import { getDb } from "../store/db.js";

const FSA_HEADERS = {
  "x-api-version": "2",
  Accept: "application/json",
};

const fsaDetailScoresSchema = z.object({
  Hygiene: z.number().nullable().optional(),
  Structural: z.number().nullable().optional(),
  ConfidenceInManagement: z.number().nullable().optional(),
});

const fsaDetailResponseSchema = z.object({
  FHRSID: z.number(),
  scores: fsaDetailScoresSchema.optional(),
});

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function scoresFromFsaApi(
  scores: z.infer<typeof fsaDetailScoresSchema> | undefined,
): FsaBreakdownScores {
  return {
    hygiene: parseScore(scores?.Hygiene),
    structural: parseScore(scores?.Structural),
    management: parseScore(scores?.ConfidenceInManagement),
  };
}

/** GET /Establishments/{id} — Hygiene, Structural, ConfidenceInManagement (FHRS only). */
export async function fetchEstablishmentScores(fsaId: number): Promise<FsaBreakdownScores | null> {
  const base = productConfig.fsa.baseUrl.replace(/\/$/, "");
  const url = `${base}/Establishments/${fsaId}`;
  const response = await fetch(url, { headers: FSA_HEADERS });
  if (!response.ok) {
    return null;
  }

  try {
    const json: unknown = await response.json();
    const parsed = fsaDetailResponseSchema.parse(json);
    const breakdown = scoresFromFsaApi(parsed.scores);
    const hasAny =
      breakdown.hygiene !== null ||
      breakdown.structural !== null ||
      breakdown.management !== null;
    return hasAny ? breakdown : null;
  } catch {
    return null;
  }
}

export async function updateLeadFsaScores(
  leadId: number,
  scores: FsaBreakdownScores,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads SET
        fsa_score_hygiene = ?,
        fsa_score_structural = ?,
        fsa_score_management = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [scores.hygiene, scores.structural, scores.management, leadId],
  });
}

export async function ensureLeadFsaScores(
  leadId: number,
  fsaId: number,
  existing: FsaBreakdownScores,
): Promise<FsaBreakdownScores> {
  const hasStored =
    existing.hygiene !== null ||
    existing.structural !== null ||
    existing.management !== null;
  if (hasStored) {
    return existing;
  }

  const fetched = await fetchEstablishmentScores(fsaId);
  if (!fetched) {
    return existing;
  }

  await updateLeadFsaScores(leadId, fetched);
  return fetched;
}
