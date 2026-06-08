import { appendOptOutFooter } from "./outreach-halt.js";
import {
  firstTouchAllowsLandingLink,
  getOutreachLandingUrl,
} from "./outreach-landing-url.js";

/** Remove http(s) URLs and bare wa.me links from outreach copy. */
export function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwa\.me\/\S+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeUrlToken(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, "");
}

/** Keep only the configured SafeScore URL; strip other links. */
export function stripUrlsExceptLanding(text: string, landingUrl: string): string {
  const landing = landingUrl.trim();
  const lines = text.split("\n");
  const kept = lines.map((line) => {
    if (!/https?:\/\//i.test(line) && !/\bwa\.me\//i.test(line)) {
      return line;
    }
    const urls = [...line.matchAll(/https?:\/\/\S+/gi)].map((m) => normalizeUrlToken(m[0] ?? ""));
    const wa = [...line.matchAll(/\bwa\.me\/\S+/gi)].map((m) => m[0] ?? "");
    const allowed = urls.some((u) => u === landing || u.startsWith(`${landing}/`));
    if (allowed && wa.length === 0) {
      return line;
    }
    if (allowed) {
      return line.replace(/\bwa\.me\/\S+/gi, "").trim();
    }
    return line
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\bwa\.me\/\S+/gi, "")
      .trim();
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function containsUrl(text: string): boolean {
  return /https?:\/\/\S+/i.test(text) || /\bwa\.me\/\S+/i.test(text);
}

export function isFirstTouchDraftValid(text: string): boolean {
  if (!containsUrl(text)) {
    return true;
  }
  if (!firstTouchAllowsLandingLink()) {
    return false;
  }
  const landing = getOutreachLandingUrl();
  const urls = [...text.matchAll(/https?:\/\/\S+/gi)].map((m) => normalizeUrlToken(m[0] ?? ""));
  if (/\bwa\.me\/\S+/i.test(text)) {
    return false;
  }
  if (urls.length === 0) {
    return true;
  }
  return urls.every((u) => u === landing || u.startsWith(`${landing}/`));
}

export interface PrepareOutboundMessageOptions {
  body: string;
  touchCount: number;
  hasReplied: boolean;
  unsubscribeUrl?: string;
}

/**
 * First touch: plain text, or SafeScore link only when OUTREACH_FIRST_TOUCH_LINK is enabled.
 */
export function prepareOutboundMessage(options: PrepareOutboundMessageOptions): {
  text: string;
  html: string | null;
} {
  const isFirstTouch = options.touchCount === 0 && !options.hasReplied;
  let text = options.body.trim();

  if (isFirstTouch) {
    if (firstTouchAllowsLandingLink()) {
      text = stripUrlsExceptLanding(text, getOutreachLandingUrl());
    } else {
      text = stripUrls(text);
    }
  }

  if (options.unsubscribeUrl?.trim()) {
    text = appendOptOutFooter(text, options.unsubscribeUrl.trim());
  }

  const landing = getOutreachLandingUrl();
  const useHtml =
    text.includes(landing) ||
    (!isFirstTouch && containsUrl(text));

  return {
    text,
    html: useHtml ? plainTextToHtml(text) : null,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkifyEscapedLine(line: string): string {
  return line
    .replace(
      /(https?:\/\/[^\s<]+)/gi,
      (url) => `<a href="${url}">${url}</a>`,
    )
    .replace(
      /(\bwa\.me\/[^\s<]+)/gi,
      (url) => `<a href="https://${url}">${url}</a>`,
    );
}

function plainTextToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<p>${linkifyEscapedLine(escapeHtml(line))}</p>`)
    .join("");
}
