import { getGeminiDraftModel } from "../src/engine/gemini-draft-model.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const original = process.env.GEMINI_DRAFT_MODEL;
delete process.env.GEMINI_DRAFT_MODEL;
assert(
  getGeminiDraftModel() === "gemini-3.1-flash-lite",
  "default must be current stable Flash-Lite",
);

process.env.GEMINI_DRAFT_MODEL = "  gemini-2.5-flash-lite  ";
assert(
  getGeminiDraftModel() === "gemini-2.5-flash-lite",
  "env override must trim",
);

if (original === undefined) {
  delete process.env.GEMINI_DRAFT_MODEL;
} else {
  process.env.GEMINI_DRAFT_MODEL = original;
}

console.log("OK gemini-draft-model");
