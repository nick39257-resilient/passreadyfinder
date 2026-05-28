import { contactDiscoveryUserAgent } from "./robots.js";

const MIN_DELAY_MS = 2_000;
let lastFetchAt = 0;

async function throttleFetch(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, MIN_DELAY_MS - (now - lastFetchAt));
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastFetchAt = Date.now();
}

export async function fetchPageHtml(url: string): Promise<string | null> {
  await throttleFetch();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": contactDiscoveryUserAgent(),
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return null;
    }
    return await res.text();
  } catch {
    return null;
  }
}

export function normalizeWebsiteUrl(website: string): string | null {
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

export function joinUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}
