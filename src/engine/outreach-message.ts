import { appendOptOutFooter } from "./outreach-halt.js";

/** Remove http(s) URLs and bare wa.me links from outreach copy. */
export function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwa\.me\/\S+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function containsUrl(text: string): boolean {
  return /https?:\/\/\S+/i.test(text) || /\bwa\.me\/\S+/i.test(text);
}

export interface PrepareOutboundMessageOptions {
  body: string;
  touchCount: number;
  hasReplied: boolean;
  unsubscribeUrl?: string;
}

/**
 * First touch: plain text, no links (spam filters). After reply: links allowed.
 */
export function prepareOutboundMessage(options: PrepareOutboundMessageOptions): {
  text: string;
  html: string | null;
} {
  const isFirstTouch = options.touchCount === 0 && !options.hasReplied;
  let text = options.body.trim();

  if (isFirstTouch) {
    text = stripUrls(text);
  }

  if (options.unsubscribeUrl?.trim()) {
    text = appendOptOutFooter(text, options.unsubscribeUrl.trim());
  }

  if (isFirstTouch) {
    return { text, html: null };
  }

  return {
    text,
    html: plainTextToHtml(text),
  };
}

function plainTextToHtml(text: string): string {
  return text
    .split("\n")
    .map(
      (line) =>
        `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    )
    .join("");
}
