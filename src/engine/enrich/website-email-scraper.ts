import {
  extractEmailsFromText,
  pickBusinessEmail,
} from "./email-from-website.js";

const SCRAPE_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/contactus",
  "/about",
  "/about-us",
  "/get-in-touch",
  "/find-us",
  "/locations",
  "/privacy",
  "/privacy-policy",
  "/order",
  "/menu",
  "/impressum",
  "/support",
];

function normalizeWebsiteUrl(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function joinUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}

function isHtmlLikeContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  if (!lower) {
    return true;
  }
  if (lower.includes("text/html") || lower.includes("application/xhtml")) {
    return true;
  }
  if (lower.includes("text/plain")) {
    return true;
  }
  return false;
}

function looksLikeHtml(body: string): boolean {
  const sample = body.slice(0, 4000).toLowerCase();
  return sample.includes("<html") || sample.includes("<body") || sample.includes("<!doctype");
}

/** Decode common anti-scrape email obfuscation on takeaway sites. */
export function deobfuscateHtmlForEmail(html: string): string {
  return html
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s+&#64;\s+/g, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/\s+dot\s+/gi, ".");
}

function collectJsonLdEmails(node: unknown, out: string[]): void {
  if (node == null) {
    return;
  }
  if (typeof node === "string") {
    if (node.includes("@")) {
      out.push(...extractEmailsFromText(node));
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdEmails(item, out);
    }
    return;
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.email === "string") {
      out.push(...extractEmailsFromText(record.email));
    }
    for (const value of Object.values(record)) {
      collectJsonLdEmails(value, out);
    }
  }
}

export function extractEmailsFromJsonLd(html: string): string[] {
  const emails: string[] = [];
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      collectJsonLdEmails(JSON.parse(raw), emails);
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return emails;
}

export function harvestEmailsFromHtml(html: string, pageUrl: string): string[] {
  const deobfuscated = deobfuscateHtmlForEmail(html);
  return [
    ...extractEmailsFromText(deobfuscated),
    ...extractEmailsFromJsonLd(deobfuscated),
  ];
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "passreadyfinder/1.0 (contact enrichment)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!isHtmlLikeContentType(contentType)) {
      return null;
    }
    const body = await res.text();
    if (!contentType.toLowerCase().includes("text/html") && !looksLikeHtml(body)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

/** Fetch contact pages and return the best business email, if any. */
export async function scrapeEmailFromWebsite(website: string): Promise<string | null> {
  const url = normalizeWebsiteUrl(website);
  if (!url) {
    return null;
  }

  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return null;
    }
  })();

  if (
    host &&
    (host.includes("facebook.com") ||
      host.includes("instagram.com") ||
      host.includes("just-eat") ||
      host.includes("deliveroo") ||
      host.includes("ubereats.com"))
  ) {
    return null;
  }

  const allCandidates: string[] = [];

  for (const path of SCRAPE_PATHS) {
    const pageUrl = joinUrl(url, path);
    const html = await fetchHtml(pageUrl);
    if (!html) {
      continue;
    }
    allCandidates.push(...harvestEmailsFromHtml(html, pageUrl));
    const picked = pickBusinessEmail(allCandidates, pageUrl);
    if (picked) {
      return picked;
    }
  }

  return pickBusinessEmail(allCandidates, url);
}
