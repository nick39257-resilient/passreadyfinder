import { getGeminiDraftModel } from "../gemini-draft-model.js";
import { geminiApiQueue } from "../rate-limit-queue.js";
import { createLlmClient } from "../drafter.js";
import { geminiChatCompletionSchema } from "../../validation/gemini.schemas.js";
import type { ContactDiscoveryResult, ContactAiInsights } from "./types.js";
import type { FsaBreakdownScores } from "../intelligence/carrot.js";
import { getLowestScoreArea } from "../intelligence/carrot.js";

export async function generateContactAiInsights(input: {
  businessName: string;
  businessType: string;
  postcode: string;
  localAuthority: string;
  fsaRating: number | null;
  fsaScores: FsaBreakdownScores;
  discovery: ContactDiscoveryResult;
}): Promise<ContactAiInsights | null> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return buildFallbackInsights(input);
  }

  const weakest = getLowestScoreArea(input.fsaScores);
  const routes: string[] = [];
  if (input.discovery.facebook.value) routes.push("Facebook");
  if (input.discovery.contactFormDetected) routes.push("website contact form");
  if (input.discovery.email.value) routes.push("email");
  if (input.discovery.whatsapp.value) routes.push("WhatsApp");
  if (input.discovery.phone.value) routes.push("phone");

  const system = [
    "You advise a UK takeaway outreach operator selling PassReady (EHO checklists, allergen matrix, multilingual support, paperwork organisation).",
    "Be concise. No invented facts about the business. Persona: kitchen manager from Preston, 30 years experience.",
    "Return exactly two lines:",
    "Line 1 must start with 'Best route:' and name the top 1-2 contact channels from the data.",
    "Line 2 must start with 'Recommended pitch:' and focus on inspection readiness, allergens, multilingual support, or hygiene rating — tied to FSA weak area if given.",
  ].join("\n");

  const user = [
    `Business: ${input.businessName}`,
    `Type: ${input.businessType}`,
    `Postcode: ${input.postcode}`,
    `Area: ${input.localAuthority}`,
    `FSA rating: ${input.fsaRating ?? "unknown"}`,
    `Weakest FSA area: ${weakest ?? "unknown"}`,
    `Available routes: ${routes.join(", ") || "none found"}`,
    `Contact score: ${input.discovery.contactScore}/100`,
  ].join("\n");

  try {
    const llm = createLlmClient();
    const model = getGeminiDraftModel();
    const completion = await geminiApiQueue.run(() =>
      llm.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    );
    const parsed = geminiChatCompletionSchema.parse(completion);
    const raw = parsed.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return buildFallbackInsights(input);
    }
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const summary = lines.find((l) => l.toLowerCase().startsWith("best route")) ?? lines[0] ?? "";
    const recommendedPitch =
      lines.find((l) => l.toLowerCase().startsWith("recommended pitch")) ?? lines[1] ?? "";
    return { summary, recommendedPitch };
  } catch {
    return buildFallbackInsights(input);
  }
}

function buildFallbackInsights(input: {
  discovery: ContactDiscoveryResult;
  fsaScores: FsaBreakdownScores;
}): ContactAiInsights {
  const parts: string[] = [];
  if (input.discovery.facebook.value) parts.push("Facebook message");
  if (input.discovery.contactFormDetected) parts.push("website contact form");
  if (input.discovery.email.value) parts.push("email");
  if (input.discovery.whatsapp.value) parts.push("WhatsApp");
  if (input.discovery.phone.value) parts.push("phone");

  const route =
    parts.length > 0 ? parts.slice(0, 2).join(" + ") : "manual research (no public routes found)";
  const area = getLowestScoreArea(input.fsaScores);
  const pitch =
    area === "management"
      ? "focus on inspection readiness and organised checklists under pressure"
      : area === "hygiene"
        ? "focus on day-to-day hygiene habits and keeping/improving rating"
        : "focus on practical inspection prep and allergen paperwork";

  return {
    summary: `Best route: ${route}.`,
    recommendedPitch: `Recommended pitch: ${pitch}.`,
  };
}
