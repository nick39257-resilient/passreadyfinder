import OpenAI from "openai";
import { productConfig } from "../config/product.config.js";
import type { DraftJobParams, TargetRating } from "../types/segmentation.js";
import type { DraftHookContext } from "./intelligence/draft-hooks.js";
import type { DraftVariables } from "./intelligence/draft-variables.js";
import {
  breakupAllowsLandingLink,
  buildTrackedLandingUrl,
  firstTouchAllowsLandingLink,
  getOutreachLandingUrl,
  preferSafeScoreCta,
  shouldIncludeLandingInDraft,
} from "./outreach-landing-url.js";
import { stripUrls } from "./outreach-message.js";
import { isValidOutreachEmail } from "./outreach-email.js";
import { calculateRiskScore } from "./risk-scorer.js";
import { buildOutboundWaMeLink } from "./whatsapp-link.js";
import {
  breakupDraftMessageSchema,
  draftMessageSchema,
  firstTouchDraftMessageSchema,
  followUpDraftMessageSchema,
  legacyFirstTouchDraftMessageSchema,
} from "../validation/draft.schemas.js";
import {
  BANNED_FORMAL_WORDS,
  MAX_DRAFT_WORDS,
  stripMobileSignature,
  wordCount,
} from "../validation/draft.schemas.js";
import {
  LOCAL_AUTHORITY_FALLBACK,
  sanitizeLocalAuthorityName,
} from "../validation/authority.schemas.js";
import { geminiChatCompletionSchema } from "../validation/gemini.schemas.js";
import {
  emailNotSuppressedSql,
  ensureLeadUnsubscribeToken,
  outreachHaltedSqlArgs,
  outreachHaltedSqlInClause,
} from "./outreach-halt.js";
import { getGeminiDraftModel } from "./gemini-draft-model.js";
import { geminiApiQueue } from "./rate-limit-queue.js";
import { isLeadOutreachHalted } from "./outreach-halt.js";
import { getDb } from "./store/db.js";
import { runMigrations } from "./store/db.js";
import { queueLeadToPostbox } from "./store/review-repository.js";
import { getLeadById, setLeadNeedsEyesReason } from "./store/leads-repository.js";

export interface LeadForDraft {
  id: number;
  fsa_id: number;
  business_name: string;
  address: string;
  postcode: string;
  fsa_rating: number | null;
  fsa_last_inspection_date?: string | null;
  local_authority_name?: string | null;
  phone?: string | null;
  email: string | null;
  flag_for_review: number | null;
}

/** 1-based touch number for the email being drafted (maps from touch_count). */
export type SequenceTouch = 1 | 2 | 3 | 4;

export interface DraftSequenceContext {
  touch: SequenceTouch;
  businessName: string;
  localAuthorityName: string;
  fsaRating: number | null;
  riskScore: number;
  daysSinceInspection: number | null;
  ctaUrl: string | null;
  ctaType: "none" | "safescore" | "whatsapp";
}

/** Resolve council name for prompts — never returns blank or template tokens. */
export function resolveDraftLocalAuthorityName(raw: string | null | undefined): string {
  const fromLead = sanitizeLocalAuthorityName(raw);
  if (fromLead !== LOCAL_AUTHORITY_FALLBACK) {
    return fromLead;
  }
  const area = productConfig.area;
  if (area.mode === "localAuthority") {
    const fromConfig = sanitizeLocalAuthorityName(area.localAuthorityName);
    if (fromConfig !== LOCAL_AUTHORITY_FALLBACK) {
      return fromConfig;
    }
  }
  return LOCAL_AUTHORITY_FALLBACK;
}

export function sequenceTouchFromCount(
  touchCount: number,
  hasReplied = false,
): SequenceTouch {
  if (hasReplied) {
    return 2;
  }
  const next = Math.min(4, Math.max(1, touchCount + 1));
  return next as SequenceTouch;
}

export function daysSinceInspection(inspectionDate: string | null | undefined): number | null {
  if (!inspectionDate?.trim()) {
    return null;
  }
  const parsed = new Date(inspectionDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)));
}

const CASUAL_SUBJECT_TEMPLATES = [
  (businessName: string, _street: string) => `quick kitchen question re: ${businessName}`,
  (businessName: string, _street: string) => `owner / kitchen manager at ${businessName}?`,
  (_businessName: string, street: string) => `question about your space on ${street}`,
] as const;

const SCORE_FOLLOWUP_SUBJECT_TEMPLATES = [
  (businessName: string, _street: string) => `free score check for ${businessName}?`,
  (businessName: string, _street: string) => `quick one for ${businessName}`,
  (businessName: string, street: string) => `score thing for ${businessName} on ${street}`,
] as const;

const MOBILE_SIGNATURES = [
  "Sent from my iPhone",
  "Typed on the go, please excuse typos",
] as const;

/** First line of address — high street / road name for casual subject lines. */
export function extractStreetName(address: string): string {
  const first = address.split(",")[0]?.trim();
  if (first && first.length > 2) {
    return first;
  }
  return address.trim() || "the high street";
}

/** Randomized low-friction subject using business name or street. */
export function resolveOutreachSubject(input: {
  businessName: string;
  address: string;
  leadId?: number;
  touchCount?: number;
}): string {
  const custom = process.env.OUTREACH_EMAIL_SUBJECT?.trim();
  if (custom) {
    return custom;
  }
  const business = input.businessName.trim();
  const street = extractStreetName(input.address);
  const touchCount = input.touchCount ?? 0;
  const templates =
    touchCount >= 1 ? SCORE_FOLLOWUP_SUBJECT_TEMPLATES : CASUAL_SUBJECT_TEMPLATES;
  const idx = Math.abs((input.leadId ?? business.length + street.length) % templates.length);
  return templates[idx](business, street);
}

/** Append a plain-text mobile signature — one per lead, stable across touches. */
export function appendMobileSignature(body: string, leadId: number): string {
  const sig = MOBILE_SIGNATURES[Math.abs(leadId) % MOBILE_SIGNATURES.length];
  const trimmed = stripMobileSignature(body);
  return `${trimmed}\n\n${sig}`;
}

export type { DraftVariables };

function getWhatsAppNumber(): string {
  const number = process.env.WHATSAPP_NUMBER?.replace(/\D/g, "");
  if (!number) {
    throw new Error("WHATSAPP_NUMBER is required in .env (digits only, e.g. 447000000000)");
  }
  return number;
}

/** Trapdoor CTA — used only after the lead has replied. */
export function buildWaMeLink(businessName: string): string {
  const number = getWhatsAppNumber();
  const prefill = productConfig.outreach.whatsappPrefillTemplate.replace(
    "[Business Name]",
    businessName,
  );
  return `https://wa.me/${number}?text=${encodeURIComponent(prefill)}`;
}

/** Best-effort city from address; falls back to configured area name */
export function extractCity(lead: LeadForDraft, areaFallback?: string): string {
  const parts = lead.address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1];
    if (candidate.length > 2 && !/^\d/.test(candidate)) {
      return candidate;
    }
    if (parts.length >= 3) {
      return parts[parts.length - 2];
    }
  }

  if (areaFallback?.trim()) {
    return areaFallback.trim();
  }

  const area = productConfig.area;
  if (area.mode === "localAuthority") {
    return area.localAuthorityName;
  }

  return "your area";
}

export function createLlmClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in .env");
  }

  let baseURL = process.env.OPENAI_BASE_URL?.trim();
  if (!baseURL) {
    throw new Error(
      "OPENAI_BASE_URL is required in .env (e.g. https://generativelanguage.googleapis.com/v1beta/openai/)",
    );
  }
  if (!baseURL.endsWith("/")) {
    baseURL += "/";
  }

  return new OpenAI({ apiKey, baseURL });
}

function logLlmConfig(): void {
  const baseURL = process.env.OPENAI_BASE_URL?.trim() ?? "";
  const model = getGeminiDraftModel();
  console.log(`LLM: ${model} @ ${baseURL}`);
  console.log(`API key: ${process.env.OPENAI_API_KEY ? "set" : "missing"}\n`);
}

/**
 * Internal warmth dial — never mention stars, ratings, or inspection outcomes in copy.
 */
export function ratingToneGuidance(input: {
  fsaRating: number | null;
  riskScore?: number | null;
}): string {
  const rating = input.fsaRating;
  const risk = input.riskScore ?? null;

  if (rating !== null && rating <= 2) {
    return "Internal: they're probably stretched — extra warmth, zero judgment, like texting a mate who had a rough week.";
  }
  if (rating === 3) {
    return "Internal: steady mid-table spot — chat about small daily habits, not lectures.";
  }
  if (rating !== null && rating >= 4) {
    return "Internal: they're doing fine — light nudge about staying ahead of spot checks, not fixing problems.";
  }
  if (risk !== null && risk >= 75) {
    return "Internal: extra warmth — sounds like a hurried favour, not outreach.";
  }
  return "Internal: friendly kitchen peer down the road, typed on your phone between services.";
}

function resolveSequenceCta(input: {
  touch: SequenceTouch;
  businessName: string;
  phone?: string | null;
  landingUrl: string;
  trackingRid: number;
}): { ctaUrl: string | null; ctaType: DraftSequenceContext["ctaType"] } {
  const trackedLanding =
    input.trackingRid > 0
      ? buildTrackedLandingUrl(input.landingUrl, input.trackingRid)
      : input.landingUrl;

  if (input.touch === 1 && !firstTouchAllowsLandingLink()) {
    return { ctaUrl: null, ctaType: "none" };
  }
  if (input.touch === 4 && !breakupAllowsLandingLink()) {
    return { ctaUrl: null, ctaType: "none" };
  }

  if (preferSafeScoreCta()) {
    return { ctaUrl: trackedLanding, ctaType: "safescore" };
  }

  const whatsappUrl = buildOutboundWaMeLink({
    businessName: input.businessName,
    phone: input.phone,
    landingUrl: trackedLanding,
  });
  if (whatsappUrl && input.touch !== 1 && input.touch !== 4) {
    return { ctaUrl: whatsappUrl, ctaType: "whatsapp" };
  }
  return { ctaUrl: trackedLanding, ctaType: "safescore" };
}

const CASUAL_BANNED_WORDS = BANNED_FORMAL_WORDS.join(", ");

function authorityCasualPhrasing(authority: string): string {
  if (authority === LOCAL_AUTHORITY_FALLBACK) {
    return authority;
  }
  return `the ${authority} environmental health team`;
}

function buildAuthorityWeaveGuidance(ctx: DraftSequenceContext): string[] {
  const council = authorityCasualPhrasing(ctx.localAuthorityName);
  return [
    `local_authority_name: ${ctx.localAuthorityName}`,
    `Weave ${council} casually into the FIRST TWO SENTENCES — how a local owner talks, not a template.`,
    `Examples: "Hear anything about the ${ctx.localAuthorityName} team doing surprise rounds this week?" or "the ${ctx.localAuthorityName} council inspectors have been busy lately."`,
    "Never use {{brackets}} or placeholder tokens. Sound like gossip between kitchen managers.",
  ];
}

function buildTouchSequenceGuidance(ctx: DraftSequenceContext, streetName: string): string[] {
  switch (ctx.touch) {
    case 1:
      return firstTouchAllowsLandingLink()
        ? [
            "Touch 1 — one SafeScore link only, still casual.",
            ...buildAuthorityWeaveGuidance(ctx),
            `Mention their spot on ${streetName} or business name naturally.`,
            "Tease a free 10-second score check — what council has on file, no signup.",
            "Drop the SafeScore link on its own line — 'free thing I built, takes 10 seconds'.",
            "No wa.me, no sales pitch, no product name.",
          ]
        : [
            "Touch 1 — zero links, zero pitch.",
            ...buildAuthorityWeaveGuidance(ctx),
            `Also mention their spot on ${streetName} or use their business name naturally.`,
            "ONE open question only — like you spotted their team and wondered something.",
            `Style reference: "Hey, saw your team on ${streetName}. Hear anything about the ${ctx.localAuthorityName} team doing surprise rounds this week? Got a quick checklist that helped us if you want it."`,
            "Do NOT include URLs, wa.me, or anything that sounds like marketing.",
          ];
    case 2:
      return [
        "Touch 2 — quick bump, still casual.",
        ...buildAuthorityWeaveGuidance(ctx),
        "Lead with curiosity — 'shows what the council has on file in about 10 seconds'.",
        ctx.ctaType === "whatsapp"
          ? "Drop the WhatsApp link exactly as given — 'easier to ping me here'."
          : "Drop the SafeScore link exactly as given — own line, 'no signup, just curious what you'd get'.",
      ];
    case 3:
      return [
        "Touch 3 — different angle, still short.",
        "Acknowledge they're slammed. Frame as a favour — 'built this for our kitchen, might save you a headache before the next round'.",
        ctx.ctaType === "whatsapp"
          ? "WhatsApp link on its own line."
          : "SafeScore link on its own line — mention it's free and takes seconds.",
      ];
    case 4:
      return breakupAllowsLandingLink()
        ? [
            "Touch 4 — last note. Say this is your final message.",
            "Soft close — 'if you ever want to see your score, link below — won't bug you again'.",
            "Include the SafeScore link on its own line. No guilt, no pressure.",
          ]
        : [
            "Touch 4 — last note. Say this is your final message.",
            "No links. No guilt. 'won't bug you again' energy.",
          ];
    default:
      return [];
  }
}

function buildSystemPrompt(ctx: DraftSequenceContext, streetName: string): string {
  const lines = [
    "You are a UK takeaway kitchen manager typing a quick email on your phone between services.",
    "Write like a hurried peer down the road — NOT a vendor, consultant, or official body.",
    "Absolute max 60 words in the body (before any signature). Aim for 35–50 words.",
    "Plain text only. No headers, dividers, bullet lists, or HTML styling.",
    "Sound like a text message: contractions, incomplete sentences OK, one short paragraph.",
    `NEVER use these words: ${CASUAL_BANNED_WORDS}.`,
    "Never say: compliance, optimization, urgency, solutions, FSA pressure, platform, software, leverage.",
    "Never mention star ratings, inspection scores, or EHO outcomes.",
    "Never claim you're on their road or know their exact location — reference the street name only.",
    ratingToneGuidance({
      fsaRating: ctx.fsaRating,
      riskScore: ctx.riskScore,
    }),
    ...buildTouchSequenceGuidance(ctx, streetName),
  ];

  if (ctx.ctaUrl) {
    lines.push(
      `Required link (own line, exactly): ${ctx.ctaUrl}`,
      "Frame it as a free 10-second score check — what the council has on file, no signup.",
      "Never say platform, software, or compliance product.",
    );
  }

  return lines.join("\n");
}

function buildUserPrompt(lead: LeadForDraft, streetName: string, ctx: DraftSequenceContext): string {
  const lines = [
    `business_name: ${lead.business_name}`,
    `street_name: ${streetName}`,
    `local_authority_name: ${ctx.localAuthorityName}`,
    `touch: ${ctx.touch} of 4`,
    "",
    "Write the email body now. Use their business name OR street — at least one.",
  ];

  if (ctx.touch === 1 || ctx.touch === 2) {
    lines.push(
      `Required: weave ${ctx.localAuthorityName} into the first two sentences — casual, like a local owner.`,
    );
  }

  if (ctx.ctaUrl) {
    lines.push(`Link to include: ${ctx.ctaUrl}`);
  } else {
    lines.push("No links.");
  }

  return lines.join("\n");
}

function assertCasualDraftContext(draft: string, lead: LeadForDraft): void {
  const body = stripMobileSignature(draft).toLowerCase();
  const name = lead.business_name.trim().toLowerCase();
  const street = extractStreetName(lead.address).toLowerCase();
  const streetTokens = street.split(/\s+/).filter((w) => w.length > 3);

  const hasName = name.length >= 3 && body.includes(name);
  const hasStreet = streetTokens.some((t) => body.includes(t));

  if (!hasName && !hasStreet) {
    throw new Error(`Draft must mention ${lead.business_name} or ${street}`);
  }
}

async function shortenDraftToWordLimit(input: {
  llm: OpenAI;
  model: string;
  includeLink: boolean;
  lead: LeadForDraft;
  original: string;
}): Promise<string> {
  const guard = input.includeLink
    ? `Keep under ${MAX_DRAFT_WORDS} words. Keep any CTA link. Sound like a rushed text from a mate.`
    : `Keep under ${MAX_DRAFT_WORDS} words. Remove any links/URLs.`;

  const system = [
    "You rewrite drafts shorter — same casual phone-text tone.",
    guard,
    `Never use: ${CASUAL_BANNED_WORDS}.`,
    "Keep business name or street reference.",
    "Return only the rewritten body — no subject, no signature, no commentary.",
  ].join("\n");

  const user = [
    `Business: ${input.lead.business_name}`,
    `Street: ${extractStreetName(input.lead.address)}`,
    "",
    "Draft to shorten:",
    stripMobileSignature(input.original),
  ].join("\n");

  const completion = await geminiApiQueue.run(() =>
    input.llm.chat.completions.create({
      model: input.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  );

  const parsed = geminiChatCompletionSchema.parse(completion);
  const text = parsed.choices[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("LLM returned empty content while shortening draft");
  }
  return text;
}

export async function fetchLeadsNeedingDraft(
  limit = productConfig.outreach.draftBatchSize,
  targetRating?: TargetRating,
): Promise<LeadForDraft[]> {
  const db = getDb();
  const result = targetRating
    ? await db.execute({
        sql: `
          SELECT id, fsa_id, business_name, address, postcode, fsa_rating, fsa_last_inspection_date, local_authority_name, phone, email, flag_for_review
          FROM leads
          WHERE draft_message IS NULL
            AND ${outreachHaltedSqlInClause()}
            AND COALESCE(touch_count, 0) < 4
            AND ${emailNotSuppressedSql()}
            AND fsa_rating = ?
          ORDER BY lead_score DESC
          LIMIT ?
        `,
        args: [...outreachHaltedSqlArgs(), targetRating, limit],
      })
    : await db.execute({
        sql: `
          SELECT id, fsa_id, business_name, address, postcode, fsa_rating, fsa_last_inspection_date, local_authority_name, phone, email, flag_for_review
          FROM leads
          WHERE draft_message IS NULL
            AND ${outreachHaltedSqlInClause()}
            AND COALESCE(touch_count, 0) < 4
            AND ${emailNotSuppressedSql()}
          ORDER BY lead_score DESC
          LIMIT ?
        `,
        args: [...outreachHaltedSqlArgs(), limit],
      });

  return result.rows as unknown as LeadForDraft[];
}

export async function saveDraftMessage(leadId: number, message: string): Promise<void> {
  await ensureLeadUnsubscribeToken(leadId);
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads
      SET draft_message = ?, status = 'drafted', updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [message.trim(), leadId],
  });
}

function reviewAllDraftsEnabled(): boolean {
  return String(process.env.REVIEW_ALL_DRAFTS ?? "")
    .trim()
    .toLowerCase() === "true";
}

function checkPersonaForAutoApproval(draft: string): { ok: true } | { ok: false; reason: string } {
  const text = stripMobileSignature(draft).toLowerCase();
  const disqualifying = [
    "consultant",
    "specialist",
    "i represent",
    "on behalf of",
    "agency",
    "software",
    "platform",
    "compliance",
    "optimization",
    "optimisation",
    "solutions",
    "dear sir",
    "dear madam",
    "to whom",
    "kind regards",
    "best regards",
  ];
  for (const term of disqualifying) {
    if (text.includes(term)) {
      return { ok: false, reason: `persona_disqualifying_term:${term}` };
    }
  }

  const hasFirstPerson = /\b(i|i['’]m|im|i['’]ve|ive|my|me|hey)\b/i.test(draft);
  if (!hasFirstPerson) {
    return { ok: false, reason: "persona_missing_first_person" };
  }

  return { ok: true };
}

function draftQualityGate(input: {
  lead: LeadForDraft;
  draft: string;
}): { pass: true } | { pass: false; reason: string } {
  // Kill-switch: force every draft into "Needs Eyes" (manual /review lane).
  if (reviewAllDraftsEnabled()) {
    return { pass: false, reason: "review_all_drafts_enabled" };
  }

  // Manual override: force "Needs Eyes" (high value / handwrite / edge cases).
  if (Number(input.lead.flag_for_review ?? 0) === 1) {
    return { pass: false, reason: "flagged_for_review" };
  }

  // Auto-postbox lane requires a mailable business email.
  if (!isValidOutreachEmail(input.lead.email)) {
    return { pass: false, reason: "missing_business_email" };
  }

  // Lightweight persona safety net for unattended auto-approval.
  const persona = checkPersonaForAutoApproval(input.draft);
  if (!persona.ok) {
    return { pass: false, reason: persona.reason };
  }

  return { pass: true };
}

export async function routeDraftAfterSave(input: {
  lead: LeadForDraft;
  draft: string;
}): Promise<{ lane: "postbox" } | { lane: "needs_eyes"; reason: string }> {
  const gate = draftQualityGate({ lead: input.lead, draft: input.draft });
  if (!gate.pass) {
    await setLeadNeedsEyesReason(input.lead.id, gate.reason);
    return { lane: "needs_eyes", reason: gate.reason };
  }

  const queued = await queueLeadToPostbox(input.lead.id);
  if (!queued) {
    await setLeadNeedsEyesReason(input.lead.id, "auto_postbox_failed");
    return { lane: "needs_eyes", reason: "auto_postbox_failed" };
  }

  await setLeadNeedsEyesReason(input.lead.id, null);
  return { lane: "postbox" };
}

export async function generateDraftForLead(
  lead: LeadForDraft,
  client?: OpenAI,
  options?: {
    hookContext?: DraftHookContext;
    consultantTip?: string | null;
    variables?: DraftVariables;
    /** First outreach = no link. After reply = include WhatsApp link. */
    includeLink?: boolean;
    touchCount?: number;
    hasReplied?: boolean;
  },
): Promise<string> {
  const touchCount = options?.touchCount ?? 0;
  const hasReplied = options?.hasReplied ?? false;
  const sequenceTouch = sequenceTouchFromCount(touchCount, hasReplied);
  const landingUrl = getOutreachLandingUrl();

  const includeLink = shouldIncludeLandingInDraft({
    includeLink: options?.includeLink,
    hasReplied,
    touchCount,
  });

  const riskScore = calculateRiskScore({
    fsaRating: lead.fsa_rating,
    fsaLastInspectionDate: lead.fsa_last_inspection_date ?? null,
    phone: lead.phone,
    website: null,
  }).score;

  const trackingRid = lead.fsa_id;
  const trackedLanding =
    trackingRid > 0 ? buildTrackedLandingUrl(landingUrl, trackingRid) : landingUrl;

  const { ctaUrl, ctaType } = includeLink
    ? resolveSequenceCta({
        touch: sequenceTouch,
        businessName: lead.business_name,
        phone: lead.phone,
        landingUrl,
        trackingRid,
      })
    : { ctaUrl: null, ctaType: "none" as const };

  const localAuthorityName = resolveDraftLocalAuthorityName(lead.local_authority_name);

  const sequenceCtx: DraftSequenceContext = {
    touch: sequenceTouch,
    businessName: lead.business_name,
    localAuthorityName,
    fsaRating: lead.fsa_rating,
    riskScore,
    daysSinceInspection: daysSinceInspection(lead.fsa_last_inspection_date),
    ctaUrl,
    ctaType,
  };

  const llm = client ?? createLlmClient();
  const streetName = extractStreetName(lead.address);

  const model = getGeminiDraftModel();
  let completion;
  try {
    completion = await geminiApiQueue.run(() =>
      llm.chat.completions.create({
        model,
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(sequenceCtx, streetName),
          },
          {
            role: "user",
            content: buildUserPrompt(lead, streetName, sequenceCtx),
          },
        ],
      }),
    );
  } catch (err) {
    if (err instanceof OpenAI.APIError && err.status === 404) {
      throw new Error(
        `404 from Gemini: model "${model}" not found. Check available models at /v1beta/openai/models.`,
      );
    }
    if (err instanceof OpenAI.APIError && err.status === 429) {
      throw new Error(
        `Gemini rate limited (429) after retries — wait and try again, or reduce draft batch size.`,
      );
    }
    throw err;
  }

  const parsed = geminiChatCompletionSchema.parse(completion);
  let raw = parsed.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error(`LLM returned empty content for lead ${lead.id}`);
  }

  const validate = (text: string): string => {
    if (sequenceTouch === 1 && !hasReplied) {
      if (firstTouchAllowsLandingLink() && includeLink && ctaUrl) {
        let ok = legacyFirstTouchDraftMessageSchema.parse(text);
        if (!ok.includes(ctaUrl)) {
          ok = `${ok.trim()}\n\n${ctaUrl}`;
        }
        return draftMessageSchema.parse(ok);
      }
      return firstTouchDraftMessageSchema.parse(stripUrls(text));
    }
    if (sequenceTouch === 4) {
      if (breakupAllowsLandingLink() && includeLink && ctaUrl) {
        let ok = breakupDraftMessageSchema.parse(text);
        if (!ok.includes(ctaUrl)) {
          ok = `${ok.trim()}\n\n${ctaUrl}`;
        }
        return draftMessageSchema.parse(ok);
      }
      return breakupDraftMessageSchema.parse(stripUrls(text));
    }
    if (includeLink && ctaUrl) {
      let ok = followUpDraftMessageSchema(ctaUrl).parse(text);
      if (!ok.includes(ctaUrl)) {
        ok = `${ok.trim()}\n\n${ctaUrl}`;
      }
      return draftMessageSchema.parse(ok);
    }
    if (includeLink) {
      const ok = draftMessageSchema.parse(text);
      const linkNeedle = ctaUrl ?? trackedLanding;
      if (linkNeedle && !ok.includes(linkNeedle)) {
        return draftMessageSchema.parse(`${ok.trim()}\n\n${linkNeedle}`);
      }
      return ok;
    }
    return draftMessageSchema.parse(stripUrls(text));
  };

  try {
    raw = validate(raw);
  } catch (err) {
    // Most common: model drifts over word limit. Retry once with a shorten pass.
    const message = err instanceof Error ? err.message : String(err);
    const isWordLimit = message.includes("Draft exceeds") || wordCount(raw) > MAX_DRAFT_WORDS;
    if (!isWordLimit) {
      throw err;
    }

    const shortened = await shortenDraftToWordLimit({
      llm,
      model,
      includeLink,
      lead,
      original: raw,
    });
    raw = validate(shortened);
  }

  assertCasualDraftContext(raw, lead);
  return appendMobileSignature(raw, lead.id);
}

export interface DraftRunResult {
  drafted: number;
  skipped: number;
  errors: { leadId: number; businessName: string; error: string }[];
}

export interface FollowUpDraftResult {
  drafted: boolean;
  lane?: "postbox" | "needs_eyes";
  reason?: string;
  touch?: SequenceTouch;
}

/** After a send, draft the next sequence touch (2–4) so SafeScore links reach the postbox. */
export async function draftSequenceFollowUpForLead(
  leadId: number,
  client?: OpenAI,
): Promise<FollowUpDraftResult> {
  const row = await getLeadById(leadId);
  if (!row || isLeadOutreachHalted(row)) {
    return { drafted: false };
  }
  if (row.replied_at?.trim()) {
    return { drafted: false };
  }

  const touchCount = row.touch_count ?? 0;
  if (touchCount >= productConfig.outreach.maxTouchesPerLead) {
    return { drafted: false };
  }

  const lead: LeadForDraft = {
    id: row.id,
    fsa_id: row.fsa_id,
    business_name: row.business_name,
    address: row.address,
    postcode: row.postcode,
    fsa_rating: row.fsa_rating,
    fsa_last_inspection_date: row.fsa_last_inspection_date ?? null,
    local_authority_name: row.local_authority_name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    flag_for_review: row.flag_for_review ?? 0,
  };

  const sequenceTouch = sequenceTouchFromCount(touchCount, false);
  const draft = await generateDraftForLead(lead, client, { touchCount });
  await saveDraftMessage(leadId, draft);
  const routed = await routeDraftAfterSave({ lead, draft });

  if (routed.lane === "postbox") {
    return { drafted: true, lane: "postbox", touch: sequenceTouch };
  }
  return { drafted: true, lane: "needs_eyes", reason: routed.reason, touch: sequenceTouch };
}

/** Fetch top un-drafted leads, generate copy via LLM, save to draft_message. Does not send. */
export async function runDrafter(options?: DraftJobParams): Promise<DraftRunResult> {
  await runMigrations();

  const leads = await fetchLeadsNeedingDraft(
    productConfig.outreach.draftBatchSize,
    options?.targetRating,
  );
  const result: DraftRunResult = { drafted: 0, skipped: 0, errors: [] };

  if (leads.length === 0) {
    return result;
  }

  console.log(`Drafting ${leads.length} lead(s)…\n`);
  logLlmConfig();

  const llmClient = createLlmClient();

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      const draft = await generateDraftForLead(lead, llmClient, {
        touchCount: 0,
      });
      await saveDraftMessage(lead.id, draft);
      result.drafted++;
      console.log(`✓ ${lead.business_name}`);
      console.log(`  ${draft.split("\n").join("\n  ")}\n`);

      // AUTO lane: if the draft passes the quality gate, move it straight into Postbox.
      // MANUAL lane: /review uses approveDraft() (edit + approve) for items routed into Needs Eyes.
      const routed = await routeDraftAfterSave({ lead, draft });
      if (routed.lane === "postbox") {
        console.log(`  → auto-postboxed\n`);
      } else {
        console.log(`  ⊘ Needs Eyes: ${routed.reason}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({
        leadId: lead.id,
        businessName: lead.business_name,
        error: message,
      });
      console.error(`✗ ${lead.business_name}: ${message}\n`);
    }
  }

  return result;
}
