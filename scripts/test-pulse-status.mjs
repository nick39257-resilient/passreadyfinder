import {
  formatFailedJobError,
  isWithinPulseErrorWindow,
  resolveRecentJobPulseError,
} from "../src/engine/intelligence/pulse-status.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const geminiMsg =
  "Gemini rate limited (429) after retries — wait and try again, or reduce draft batch size.";

assert(
  formatFailedJobError("quick_draft", geminiMsg) ===
    "Drafting paused: Gemini busy — will retry",
  "quick_draft 429 must not say Send failed",
);
assert(
  formatFailedJobError("draft", geminiMsg) === "Drafting paused: Gemini busy — will retry",
  "draft 429 label",
);
assert(
  formatFailedJobError("send", "Resend rejected").startsWith("Send failed:"),
  "send keeps Send failed",
);
assert(
  formatFailedJobError("find", "FSA timeout").startsWith("FindLeads failed:"),
  "find label",
);

const now = Date.parse("2026-05-27T12:00:00Z");
assert(
  isWithinPulseErrorWindow("2026-05-27 11:30:00", now) === true,
  "30m ago within 60m",
);
assert(
  isWithinPulseErrorWindow("2026-05-27 10:00:00", now) === false,
  "2h ago outside 60m",
);

const staleFailed = resolveRecentJobPulseError(
  [
    {
      id: "1",
      type: "quick_draft",
      status: "failed",
      error: geminiMsg,
      updated_at: "2026-05-27 10:00:00",
      created_at: "2026-05-27 10:00:00",
    },
  ],
  now,
);
assert(staleFailed === null, "stale failed job must not surface");

const freshFailed = resolveRecentJobPulseError(
  [
    {
      id: "2",
      type: "quick_draft",
      status: "failed",
      error: geminiMsg,
      updated_at: "2026-05-27 11:45:00",
      created_at: "2026-05-27 11:45:00",
    },
  ],
  now,
);
assert(freshFailed === "Drafting paused: Gemini busy — will retry", "fresh failed surfaces");

const clearedBySuccess = resolveRecentJobPulseError(
  [
    {
      id: "3",
      type: "send",
      status: "done",
      error: null,
      updated_at: "2026-05-27 11:50:00",
      created_at: "2026-05-27 11:50:00",
    },
    {
      id: "2",
      type: "quick_draft",
      status: "failed",
      error: geminiMsg,
      updated_at: "2026-05-27 11:45:00",
      created_at: "2026-05-27 11:45:00",
    },
  ],
  now,
);
assert(clearedBySuccess === null, "newer done job clears error");

console.log("OK pulse-status");
