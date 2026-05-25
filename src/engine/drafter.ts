import OpenAI from "openai";
import { productConfig } from "../config/product.config.js";
import type { DraftJobParams, TargetRating } from "../types/segmentation.js";
import { geminiChatCompletionSchema } from "../validation/gemini.schemas.js";
import { getDb } from "./store/db.js";
import { runMigrations } from "./store/db.js";

export interface LeadForDraft {
  id: number;
  business_name: string;
  address: string;
  postcode: string;
  fsa_rating: number | null;
}

function getWhatsAppNumber(): string {
  const number = process.env.WHATSAPP_NUMBER?.replace(/\D/g, "");
  if (!number) {
    throw new Error("WHATSAPP_NUMBER is required in .env (digits only, e.g. 447000000000)");
  }
  return number;
}

/** Trapdoor CTA — sole link in every draft */
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

const GEMINI_MODEL = "gemini-2.5-flash";

function createLlmClient(): OpenAI {
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
  console.log(`LLM: ${GEMINI_MODEL} @ ${baseURL}`);
  console.log(`API key: ${process.env.OPENAI_API_KEY ? "set" : "missing"}\n`);
}

function ratingToneGuidance(rating: number | null): string {
  if (rating === 2) {
    return "Tone: recovery and compliance-focused. They need practical help getting inspection-ready without shame.";
  }
  if (rating === 3) {
    return "Tone: growth and habit-focused. Emphasize building consistent daily routines that stick.";
  }
  if (rating === 4 || rating === 5) {
    return "Tone: efficiency and time-saving. They are doing well—focus on saving manager time and simplifying paperwork.";
  }
  return "Tone: supportive ally. Focus on being ready for their next inspection.";
}

function buildSystemPrompt(waMeLink: string, rating: number | null): string {
  return [
    "You are drafting a short, casual, text-based email to a UK takeaway owner.",
    ratingToneGuidance(rating),
    "Pitch PassReady—a digital EHO compliance tool (English, Urdu, Bengali, Polish). Be an ally, never accusatory.",
    "Maximum 125 words. No images. No attachments. Plain, internal-style tone.",
    ...productConfig.outreach.pitchGuidelines,
    `End the message with this exact link: ${waMeLink}`,
    "Do not add any other links or calls-to-action.",
  ].join("\n");
}

function buildUserPrompt(lead: LeadForDraft, city: string, waMeLink: string): string {
  const rating =
    lead.fsa_rating === null ? "unrated" : String(lead.fsa_rating);

  return [
    `Takeaway name: ${lead.business_name}`,
    `FSA rating: ${rating} (out of 5)`,
    `City: ${city}`,
    `Required closing link (use exactly): ${waMeLink}`,
  ].join("\n");
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
          WHERE draft_message IS NULL AND fsa_rating = ?
          ORDER BY lead_score DESC
          LIMIT ?
        `,
        args: [targetRating, limit],
      })
    : await db.execute({
        sql: `
          SELECT id, business_name, address, postcode, fsa_rating
          FROM leads
          WHERE draft_message IS NULL
          ORDER BY lead_score DESC
          LIMIT ?
        `,
        args: [limit],
      });

  return result.rows as unknown as LeadForDraft[];
}

export async function saveDraftMessage(leadId: number, message: string): Promise<void> {
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
): Promise<string> {
  const city = extractCity(lead);
  const waMeLink = buildWaMeLink(lead.business_name);
  const llm = client ?? createLlmClient();

  let completion;
  try {
    completion = await llm.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildSystemPrompt(waMeLink, lead.fsa_rating) },
        { role: "user", content: buildUserPrompt(lead, city, waMeLink) },
      ],
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError && err.status === 404) {
      throw new Error(
        `404 from Gemini: model "${GEMINI_MODEL}" not found. Check available models at /v1beta/openai/models.`,
      );
    }
    throw err;
  }

  const parsed = geminiChatCompletionSchema.parse(completion);
  const content = parsed.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`LLM returned empty content for lead ${lead.id}`);
  }

  return content;
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
      const draft = await generateDraftForLead(lead, llmClient);
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

    if (i < leads.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  return result;
}
