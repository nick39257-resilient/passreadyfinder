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
import { stripUrls } from "./outreach-message.js";
import {
  draftMessageSchema,
  firstTouchDraftMessageSchema,
} from "../validation/draft.schemas.js";
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

function getTrialUrl(): string {
  const fromEnv = process.env[productConfig.outreach.trialUrlEnvKey]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return "https://passready.uk";
}

export interface LeadForDraft {
  id: number;
  business_name: string;
  address: string;
  postcode: string;
  fsa_rating: number | null;
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
  waMeLink?: string,
): string {
  const trialUrl = getTrialUrl();
  const lines = [
    "You write a short, conversational email to a UK takeaway owner—as one operator to another, not as a vendor.",
    "You are a kitchen manager based in Preston. Never claim to own/run multiple takeaways, never claim to be in any other town, and never invent personal history or results.",
    ratingToneGuidance(rating),
    "PassReady is a side project you built for your own kitchen team (EHO checklists in English, Urdu, Bengali, Polish)—mention it only as something that helped you, not as a product launch.",
    "Maximum 125 words. No images. No attachments. Plain, internal-style tone.",
    ...productConfig.outreach.pitchGuidelines,
    ...hookLines,
  ];

  if (includeLink && waMeLink) {
    lines.push(
      `End with a simple next step and include this exact trial link on its own line: ${trialUrl}`,
      "Do not add any other links.",
    );
  } else {
    lines.push(
      "Do NOT include any URLs, links, or wa.me in this message.",
      "End with: 'If you want, reply YES and I’ll switch on a 7-day trial for you.'",
    );
  }

  return lines.join("\n");
}

function buildUserPrompt(
  lead: LeadForDraft,
  variables: DraftVariables,
  includeLink: boolean,
  waMeLink?: string,
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

  if (includeLink && waMeLink) {
    lines.push(`Required closing link (use exactly): ${waMeLink}`);
  } else {
    lines.push("No links in this draft — reply-first outreach.");
  }

  return lines.join("\n");
}

export async function fetchLeadsNeedingDraft(
  limit = productConfig.outreach.draftBatchSize,
  targetRating?: TargetRating,
): Promise<LeadForDraft[]> {
  const db = getDb();
  const result = targetRating
    ? await db.execute({
        sql: `
          SELECT id, business_name, address, postcode, fsa_rating
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
          SELECT id, business_name, address, postcode, fsa_rating
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
  const includeLink = options?.includeLink ?? hasReplied;
  const waMeLink = includeLink ? buildWaMeLink(lead.business_name) : undefined;

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
            content: buildSystemPrompt(toneRating, hookLines, includeLink, waMeLink),
          },
          {
            role: "user",
            content: buildUserPrompt(lead, variables, includeLink, waMeLink),
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

  if (!includeLink) {
    raw = stripUrls(raw);
    raw = firstTouchDraftMessageSchema.parse(raw);
  } else {
    raw = draftMessageSchema.parse(raw);
    if (waMeLink && !raw.includes(waMeLink)) {
      raw = `${raw.trim()}\n\n${waMeLink}`;
    }
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
        includeLink: false,
        touchCount: 0,
      });
      await saveDraftMessage(lead.id, draft);
      result.drafted++;
      console.log(`✓ ${lead.business_name}`);
      console.log(`  ${draft.split("\n").join("\n  ")}\n`);
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
