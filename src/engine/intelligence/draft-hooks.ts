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
    lines.push(`Cost hook: mention PassReady is less than £1 a day (${productConfig.outreach.monthlyPrice} monthly).`);
  }
  if (toggles.continuity) {
    lines.push(
      "Continuity hook: stress keeping their online business and delivery reputation safe between inspections.",
    );
  }
  if (toggles.competitiveThreat && context.competitors.length > 0) {
    const rival = context.competitors[0];
    const rivalRating =
      rival.fsaRating === null ? "strong" : `${rival.fsaRating}-star`;
    lines.push(
      `Competitive threat hook: reference local rival "${rival.businessName}" (${rivalRating}) — urge them not to let rivals take customers with a stronger food hygiene rating.`,
    );
  }
  if (toggles.socialProof) {
    const count = Math.max(context.localPassReadyCount, 1);
    lines.push(
      `Social proof hook: mention that ${count} local business${count === 1 ? "" : "es"} in their area already use PassReady.`,
    );
  }

  return lines;
}
