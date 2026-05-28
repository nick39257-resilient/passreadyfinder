import { productConfig } from "../../config/product.config.js";
import type { LocalCompetitor } from "./competitors.js";

export interface DraftHookToggles {
  cost?: boolean;
  continuity?: boolean;
  competitiveThreat?: boolean;
  socialProof?: boolean;
}

export interface DraftHookContext {
  competitors: LocalCompetitor[];
  localPassReadyCount: number;
  toggles?: DraftHookToggles;
}

const DEFAULT_TOGGLES: DraftHookToggles = {
  cost: true,
  continuity: true,
  competitiveThreat: true,
  socialProof: true,
};

/** High-conversion hooks for Gemini — woven naturally, not as a bullet list. */
export function buildDraftHookGuidance(context: DraftHookContext): string[] {
  const toggles = { ...DEFAULT_TOGGLES, ...context.toggles };
  const lines: string[] = [];

  if (toggles.cost) {
    lines.push(
      `If price comes up, keep it casual—about ${productConfig.outreach.monthlyPrice} (less than £1 a day)—because you built it for yourself, not as a pitch.`,
    );
  }
  if (toggles.continuity) {
    lines.push(
      "Continuity hook: mention keeping service smooth when delivery apps and busy weekends stack up—shared struggle, not fear.",
    );
  }
  if (toggles.competitiveThreat && context.competitors.length > 0) {
    lines.push(
      "Local context: keep it generic (Preston food scene). Never claim you're on the same road/high street as the lead.",
    );
  }
  if (toggles.socialProof) {
    const count = Math.max(context.localPassReadyCount, 1);
    lines.push(
      `Social proof: ${count} nearby operator${count === 1 ? "" : "s"} tried your side project after you shared it—low-key, not a sales stat.`,
    );
  }

  return lines;
}
