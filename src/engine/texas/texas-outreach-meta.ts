import { getTexasAutopilotScoreUrl } from "../../config/score-urls.js";
import { draftContainsScoreLink } from "../outreach-sequence-meta.js";
import { buildTrackedLandingUrl } from "../outreach-landing-url.js";
import { renderHb2844DraftForLead } from "../store/texas-outreach-repository.js";
import { buildTexasFixedSiteOutreachPitch } from "./texas-outreach-pitch.js";
import type { TexasLeadRow } from "../store/texas-leads-repository.js";
import {
  isTexasOutreachComplete,
  resolveTexasOutreachChannel,
} from "./texas-outreach-channel.js";

export interface TexasOutreachMeta {
  trackedScoreUrl: string;
  outreachDraftPreview: string | null;
  draftHasScoreLink: boolean;
  needsScoreLinkRefresh: boolean;
  outreachSent: boolean;
  outreachChannel: ReturnType<typeof resolveTexasOutreachChannel>;
  lastPreviewedAt: string | null;
}

export function buildTrackedTexasScoreUrl(leadId: number): string {
  const base = getTexasAutopilotScoreUrl();
  return leadId > 0 ? buildTrackedLandingUrl(base, leadId) : base;
}

/** Effective outreach copy shown in UI / sent at runtime — always includes tracked SafeScore when possible. */
export function buildEffectiveTexasOutreachDraft(row: TexasLeadRow): string {
  const trackedScoreUrl = buildTrackedTexasScoreUrl(row.id);
  let draft = row.draft_message?.trim() ?? "";

  if (!draft && row.is_mobile_vendor === 1) {
    draft = renderHb2844DraftForLead({
      ownerName: row.owner_name,
      businessName: row.business_name,
      leadId: row.id,
    });
  } else if (!draft) {
    draft = buildTexasFixedSiteOutreachPitch({
      leadId: row.id,
      businessName: row.business_name,
    });
  }

  if (!draft) {
    return "";
  }

  if (!draftContainsScoreLink(draft)) {
    return `${draft.trim()}\n\nFree score check — no sign-up:\n${trackedScoreUrl}`;
  }

  return draft;
}

export function buildTexasOutreachMeta(row: TexasLeadRow): TexasOutreachMeta {
  const trackedScoreUrl = buildTrackedTexasScoreUrl(row.id);
  const storedDraft = row.draft_message?.trim() ?? null;
  const effectiveDraft = buildEffectiveTexasOutreachDraft(row);
  const outreachDraftPreview = effectiveDraft.trim() ? effectiveDraft.trim() : null;

  return {
    trackedScoreUrl,
    outreachDraftPreview,
    draftHasScoreLink: draftContainsScoreLink(outreachDraftPreview),
    needsScoreLinkRefresh: Boolean(storedDraft && !draftContainsScoreLink(storedDraft)),
    outreachSent: isTexasOutreachComplete(row.status),
    outreachChannel: resolveTexasOutreachChannel(row),
    lastPreviewedAt: row.last_previewed_at ?? null,
  };
}
