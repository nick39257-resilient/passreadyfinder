import OpenAI from "openai";
import { productConfig } from "../config/product.config.js";
import type { DraftJobParams, TargetRating } from "../types/segmentation.js";
import type { DraftHookContext } from "./intelligence/draft-hooks.js";
import { buildDraftHookGuidance } from "./intelligence/draft-hooks.js";
import {
  assertDraftUsesVariables,
  buildDraftVariables,
  type DraftVariables,
} from "./intelligence/draft-variables.js";
import {
  getOutreachLandingUrl,
  shouldIncludeLandingInDraft,
} from "./outreach-landing-url.js";
import { stripUrls } from "./outreach-message.js";
import { isValidOutreachEmail } from "./outreach-email.js";
import {
  draftMessageSchema,
  firstTouchDraftMessageSchema,
} from "../validation/draft.schemas.js";
import { MAX_DRAFT_WORDS, wordCount } from "../validation/draft.schemas.js";
import { geminiChatCompletionSchema } from "../validation/gemini.schemas.js";
import {
  emailNotSuppressedSql,
  ensureLeadUnsubscribeToken,
  outreachHaltedSqlArgs,
  outreachHaltedSqlInClause,
} from "./outreach-halt.js";
import { getGeminiDraftModel } from "./gemini-draft-model.js";
import { geminiApiQueue } from "./rate-limit-queue.js";
import { getDb } from "./store/db.js";
import { runMigrations } from "./store/db.js";
import { queueLeadToPostbox } from "./store/review-repository.js";
import { setLeadNeedsEyesReason } from "./store/leads-repository.js";

export interface LeadForDraft {
  id: number;
  business_name: string;
  address: string;
  postcode: string;
  fsa_rating: number | null;
  email: string | null;
  flag_for_review: number | null;
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

/** Internal pacing from FSA rating — never cite rating or inspection outcomes in the draft. */
export function ratingToneGuidance(rating: number | null): string {
  if (rating === 2) {
    return "Internal (do not mention in copy): extra warmth—they may be stretched thin; keep it practical and human.";
  }
  if (rating === 3) {
    return "Internal (do not mention in copy): steady, peer-to-peer tone—habits and small wins, not lectures.";
  }
  if (rating === 4 || rating === 5) {
    return "Internal (do not mention in copy): light touch—efficiency and peace of mind, not fixing problems.";
  }
  return "Internal (do not mention in copy): friendly peer who runs a kitchen, not a consultant auditing them.";
}

function buildSystemPrompt(
  rating: number | null,
  hookLines: string[],
  includeLink: boolean,
  landingUrl?: string,
): string {
  const lines = [
    "You write a short, conversational email to a UK takeaway owner—as one operator to another, not as a vendor.",
    "You are a kitchen manager based in Preston with 30 years of experience.",
    "Never claim to own/run multiple takeaways.",
    "Never claim to be in any other town.",
    "Never claim you are on the same road/high street as the lead or that you know their exact location.",
    "Never invent personal history, results, customers, or relationships.",
    ratingToneGuidance(rating),
    "PassReady is a side project you built for your own kitchen team (EHO checklists in English, Urdu, Bengali, Polish)—mention it only as something that helped you, not as a product launch.",
    "Hard limit: maximum 110 words (aim 80–100). No images. No attachments. Plain, internal-style tone.",
    ...productConfig.outreach.pitchGuidelines,
    ...hookLines,
  ];

  if (includeLink && landingUrl) {
    lines.push(
      `End with a simple next step and include this exact SafeScore link on its own line: ${landingUrl}`,
      "Frame it as a free instant FSA score check (no sign-up) — not a sales pitch.",
      "Do not add any other links or wa.me.",
    );
  } else {
    lines.push(
      "Do NOT include any URLs, links, or wa.me in this message.",
      "End with a curious ask inviting a reply.",
    );
  }

  return lines.join("\n");
}

function buildUserPrompt(
  lead: LeadForDraft,
  variables: DraftVariables,
  includeLink: boolean,
  landingUrl?: string,
): string {
  const lines = [
    "Required variable injection — weave all three naturally into the message:",
    `1) Business name (use exactly): ${variables.businessName}`,
    `2) FSA practical issue hook (no star rating): ${variables.fsaIssue}`,
    `3) Local reference: ${variables.localReference}`,
    `Takeaway name: ${lead.business_name}`,
  ];

  if (lead.fsa_rating !== null) {
    lines.push(
      `Internal only (never mention in the message): FSA rating ${lead.fsa_rating}/5 — calibrate warmth only; no stars, scores, or inspection talk.`,
    );
  }

  if (includeLink && landingUrl) {
    lines.push(`Required closing link (use exactly): ${landingUrl}`);
  } else {
    lines.push("No links in this draft.");
  }

  return lines.join("\n");
}

async function shortenDraftToWordLimit(input: {
  llm: OpenAI;
  model: string;
  includeLink: boolean;
  variables: DraftVariables;
  original: string;
}): Promise<string> {
  const guard = input.includeLink
    ? `Keep under ${MAX_DRAFT_WORDS} words. Keep the message truthful and compliant.`
    : `Keep under ${MAX_DRAFT_WORDS} words. Remove any links/URLs.`;

  const system = [
    "You rewrite drafts to be shorter while preserving meaning.",
    guard,
    "You MUST keep the required variable injection: business name, practical issue hook, and local reference.",
    "Do not add new claims, locations, or backstory.",
    "Return only the rewritten email body (no subject line, no bullets about what you changed).",
  ].join("\n");

  const user = [
    "Required variables (must remain present, naturally):",
    `Business name: ${input.variables.businessName}`,
    `FSA issue hook: ${input.variables.fsaIssue}`,
    `Local reference: ${input.variables.localReference}`,
    "",
    "Draft to shorten:",
    input.original,
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
          SELECT id, business_name, address, postcode, fsa_rating, email, flag_for_review
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
          SELECT id, business_name, address, postcode, fsa_rating, email, flag_for_review
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
  const text = draft.toLowerCase();
  const disqualifying = [
    "consultant",
    "specialist",
    "i represent",
    "on behalf of",
    "agency",
    "software",
    "platform",
  ];
  for (const term of disqualifying) {
    if (text.includes(term)) {
      return { ok: false, reason: `persona_disqualifying_term:${term}` };
    }
  }

  const hasFirstPerson = /\b(i|i['’]m|im|i['’]ve|ive|my|me)\b/i.test(draft);
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
    templateRating?: number | null;
    hookContext?: DraftHookContext;
    consultantTip?: string | null;
    variables?: DraftVariables;
    /** First outreach = no link. After reply = include WhatsApp link. */
    includeLink?: boolean;
    touchCount?: number;
    hasReplied?: boolean;
  },
): Promise<string> {
  const city = extractCity(lead);
  const hookContext = options?.hookContext ?? {
    competitors: [],
    localPassReadyCount: 0,
  };
  const consultantTip = options?.consultantTip?.trim() ?? "";
  const variables =
    options?.variables ??
    buildDraftVariables({
      businessName: lead.business_name,
      city,
      consultantTip,
      competitors: hookContext.competitors,
    });

  const touchCount = options?.touchCount ?? 0;
  const hasReplied = options?.hasReplied ?? false;
  const includeLink = shouldIncludeLandingInDraft({
    includeLink: options?.includeLink,
    hasReplied,
    touchCount,
  });
  const landingUrl = includeLink ? getOutreachLandingUrl() : undefined;

  const llm = client ?? createLlmClient();
  const toneRating =
    options?.templateRating !== undefined ? options.templateRating : lead.fsa_rating;
  const hookLines = options?.hookContext ? buildDraftHookGuidance(options.hookContext) : [];

  const model = getGeminiDraftModel();
  let completion;
  try {
    completion = await geminiApiQueue.run(() =>
      llm.chat.completions.create({
        model,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(toneRating, hookLines, includeLink, landingUrl),
          },
          {
            role: "user",
            content: buildUserPrompt(lead, variables, includeLink, landingUrl),
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
    if (!includeLink) {
      const stripped = stripUrls(text);
      return firstTouchDraftMessageSchema.parse(stripped);
    }
    const ok = draftMessageSchema.parse(text);
    if (landingUrl && !ok.includes(landingUrl)) {
      return `${ok.trim()}\n\n${landingUrl}`;
    }
    return ok;
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
      variables,
      original: raw,
    });
    raw = validate(shortened);
  }

  assertDraftUsesVariables(raw, variables);
  return raw;
}

export interface DraftRunResult {
  drafted: number;
  skipped: number;
  errors: { leadId: number; businessName: string; error: string }[];
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
