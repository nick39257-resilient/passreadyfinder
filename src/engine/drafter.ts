import OpenAI from "openai";
import { productConfig } from "../config/product.config.js";
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
export function extractCity(lead: LeadForDraft): string {
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

  const area = productConfig.area;
  if (area.mode === "localAuthority") {
    return area.localAuthorityName;
  }

  return "your area";
}

function createLlmClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in .env");
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

function buildSystemPrompt(waMeLink: string): string {
  return [
    "You are drafting a short, casual, text-based email to a takeaway owner.",
    "Acknowledge they might be stressed about their upcoming FSA inspection because of their recent star score. Be an ally, not an accuser.",
    "Pitch 'PassReady'—a digital EHO compliance tool that works in English, Urdu, Bengali, and Polish.",
    "Do not be overly formal. Keep it to 4 sentences max.",
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
): Promise<LeadForDraft[]> {
  const db = getDb();
  const result = await db.execute({
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
      SET draft_message = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [message.trim(), leadId],
  });
}

export async function generateDraftForLead(lead: LeadForDraft): Promise<string> {
  const city = extractCity(lead);
  const waMeLink = buildWaMeLink(lead.business_name);
  const client = createLlmClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.7,
    messages: [
      { role: "system", content: buildSystemPrompt(waMeLink) },
      { role: "user", content: buildUserPrompt(lead, city, waMeLink) },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
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
export async function runDrafter(): Promise<DraftRunResult> {
  await runMigrations();

  const leads = await fetchLeadsNeedingDraft();
  const result: DraftRunResult = { drafted: 0, skipped: 0, errors: [] };

  if (leads.length === 0) {
    return result;
  }

  console.log(`Drafting ${leads.length} lead(s)…\n`);

  for (const lead of leads) {
    try {
      const draft = await generateDraftForLead(lead);
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
