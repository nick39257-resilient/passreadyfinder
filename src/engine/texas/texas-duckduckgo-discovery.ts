import { normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";

const DDG_HTML = "https://html.duckduckgo.com/html/";
const BLOCKED_HOSTS = new Set([
  "duckduckgo.com",
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "yelp.com",
  "www.yelp.com",
  "tripadvisor.com",
  "www.tripadvisor.com",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "linkedin.com",
  "www.linkedin.com",
  "twitter.com",
  "x.com",
]);

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function unwrapDuckDuckGoRedirect(href: string): string | null {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(absolute, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      return decodeURIComponent(uddg);
    }
    if (parsed.hostname.includes("duckduckgo.com")) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractResultUrls(html: string): string[] {
  const urls: string[] = [];
  const anchorMatches = html.matchAll(
    /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["']/gi,
  );
  for (const match of anchorMatches) {
    const href = match[1];
    if (!href) {
      continue;
    }
    const resolved = unwrapDuckDuckGoRedirect(href) ?? href;
    const normalized = normalizeWebsiteUrl(resolved);
    if (normalized) {
      urls.push(normalized);
    }
  }
  return urls;
}

export function buildTexasDiscoverySearchQuery(input: {
  businessName: string;
  zip: string | null;
  city: string | null;
}): string {
  const name = input.businessName.trim();
  const place = input.zip?.trim() || input.city?.trim() || "Texas";
  return `"${name}" "${place}" Texas`;
}

/**
 * Lightweight DuckDuckGo HTML search — no API key. Returns first plausible business website.
 */
export async function discoverWebsiteViaDuckDuckGo(input: {
  businessName: string;
  zip: string | null;
  city: string | null;
}): Promise<string | null> {
  const query = buildTexasDiscoverySearchQuery(input);
  const body = new URLSearchParams({ q: query });

  try {
    const res = await fetch(DDG_HTML, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "User-Agent": "PassReadyFinder/1.0 (Texas autonomous outreach)",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const candidates = extractResultUrls(html);
    for (const url of candidates) {
      const host = hostFromUrl(url);
      if (!host || BLOCKED_HOSTS.has(host)) {
        continue;
      }
      return url;
    }
    return null;
  } catch {
    return null;
  }
}
