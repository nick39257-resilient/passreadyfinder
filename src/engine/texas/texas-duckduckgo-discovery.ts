import { normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";

const DDG_HTML = "https://html.duckduckgo.com/html/";
/** Mimic a standard Windows desktop Chrome session (not a cloud bot string). */
const DDG_CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DDG_SEARCH_DELAY_MS_MIN = 2000;
const DDG_SEARCH_DELAY_MS_MAX = 5000;
const CORP_SUFFIX_PATTERN =
  /\s*,?\s*(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation)\.?\s*$/i;
const OUT_OF_BUSINESS_PREFIX =
  /^(?:OOB|Out of Business)\s*[-–:]\s*/i;

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
  "opencorporates.com",
  "www.opencorporates.com",
  "bizapedia.com",
  "www.bizapedia.com",
  "sos.state.tx.us",
  "comptroller.texas.gov",
]);

type DiscoveryCategory = "food truck" | "catering";

/**
 * Scrub corporate noise / OOB prefixes / hyphen suffixes before DuckDuckGo lookup.
 * e.g. "St. Andrew's Episcopal School-Concession" → "St. Andrew's Episcopal School"
 */
export function cleanTexasBusinessNameForSearch(raw: string): string {
  let name = raw.trim();
  if (!name) {
    return "";
  }

  name = name.replace(OUT_OF_BUSINESS_PREFIX, "");

  const hyphenIdx = name.indexOf("-");
  if (hyphenIdx > 0) {
    name = name.slice(0, hyphenIdx);
  }

  let previous = "";
  while (previous !== name) {
    previous = name;
    name = name.replace(CORP_SUFFIX_PATTERN, "").trim();
  }

  return name.replace(/[\s,;:.–—-]+$/g, "").trim();
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function unwrapDuckDuckGoRedirect(href: string): string | null {
  try {
    const decoded = decodeHtmlEntities(href.trim());
    const absolute = decoded.startsWith("//")
      ? `https:${decoded}`
      : decoded.startsWith("/")
        ? `https://duckduckgo.com${decoded}`
        : decoded;
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

/** DuckDuckGo Lite/HTML outbound routing links — /l/?kh=…&uddg=… */
function isDdgLiteRedirectHref(href: string): boolean {
  const decoded = decodeHtmlEntities(href.trim());
  return (
    /^\/l\/\?kh=/i.test(decoded) ||
    /^\/l\?kh=/i.test(decoded) ||
    /duckduckgo\.com\/l\/\?/i.test(decoded) ||
    /duckduckgo\.com\/l\?/i.test(decoded)
  );
}

function extractUddgTargetFromRedirect(href: string): string | null {
  const decoded = decodeHtmlEntities(href.trim());
  const unwrapped = unwrapDuckDuckGoRedirect(decoded);
  if (unwrapped) {
    const normalized = normalizeWebsiteUrl(unwrapped);
    if (normalized) {
      return normalized;
    }
  }

  const uddgMatch = decoded.match(/[?&]uddg=([^&"'<>]+)/i);
  if (uddgMatch?.[1]) {
    try {
      return normalizeWebsiteUrl(decodeURIComponent(uddgMatch[1]));
    } catch {
      return normalizeWebsiteUrl(uddgMatch[1]);
    }
  }

  return null;
}

function resolveAnchorHref(href: string): string | null {
  if (!href?.trim() || href.startsWith("#") || href.startsWith("javascript:")) {
    return null;
  }

  if (isDdgLiteRedirectHref(href)) {
    return extractUddgTargetFromRedirect(href);
  }

  const resolved = unwrapDuckDuckGoRedirect(href) ?? href;
  return normalizeWebsiteUrl(resolved);
}

function pushUniqueUrl(urls: string[], url: string | null): void {
  if (url && !urls.includes(url)) {
    urls.push(url);
  }
}

/** DuckDuckGo Lite interface — scan all anchors for /l/?kh= routing redirects. */
function extractLiteResultUrls(html: string): string[] {
  const urls: string[] = [];
  const anchorPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1]?.trim();
    if (!href || !isDdgLiteRedirectHref(href)) {
      continue;
    }
    pushUniqueUrl(urls, extractUddgTargetFromRedirect(href));
  }

  return urls;
}

/** Standard DDG HTML markup — result__a / result-link title anchors. */
function extractPrimaryResultUrls(html: string): string[] {
  const urls: string[] = [];
  const patterns = [
    /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result__a[^"']*["']/gi,
    /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result-link[^"']*["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      pushUniqueUrl(urls, resolveAnchorHref(match[1] ?? ""));
    }
  }

  return urls;
}

/** Last resort — any anchor with uddg= or external http(s) link. */
function extractFallbackResultUrls(html: string): string[] {
  const urls: string[] = [];
  const anchorPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1]?.trim();
    if (!href) {
      continue;
    }

    if (isDdgLiteRedirectHref(href)) {
      pushUniqueUrl(urls, extractUddgTargetFromRedirect(href));
      continue;
    }

    const looksLikeDdgRedirect = /uddg=/i.test(decodeHtmlEntities(href));

    let looksLikeExternal = false;
    if (/^https?:\/\//i.test(href)) {
      try {
        const host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
        looksLikeExternal = !host.includes("duckduckgo.com");
      } catch {
        looksLikeExternal = false;
      }
    }

    if (!looksLikeDdgRedirect && !looksLikeExternal) {
      continue;
    }

    pushUniqueUrl(urls, resolveAnchorHref(href));
  }

  return urls;
}

function extractResultUrls(html: string): {
  urls: string[];
  liteCount: number;
  primaryCount: number;
} {
  const lite = extractLiteResultUrls(html);
  if (lite.length > 0) {
    return { urls: lite, liteCount: lite.length, primaryCount: 0 };
  }

  const primary = extractPrimaryResultUrls(html);
  if (primary.length > 0) {
    return { urls: primary, liteCount: 0, primaryCount: primary.length };
  }

  const fallback = extractFallbackResultUrls(html);
  return { urls: fallback, liteCount: 0, primaryCount: 0 };
}

export function buildTexasDiscoverySearchQuery(input: {
  businessName: string;
  category?: DiscoveryCategory;
}): string {
  const cleaned = cleanTexasBusinessNameForSearch(input.businessName);
  const name = cleaned || input.businessName.trim();
  const category = input.category ?? "food truck";
  return `${name} Texas ${category}`;
}

function discoveryCategories(isMobileVendor?: boolean): DiscoveryCategory[] {
  if (isMobileVendor) {
    return ["food truck", "catering"];
  }
  return ["catering", "food truck"];
}

function randomSearchDelayMs(): number {
  return (
    DDG_SEARCH_DELAY_MS_MIN +
    Math.floor(Math.random() * (DDG_SEARCH_DELAY_MS_MAX - DDG_SEARCH_DELAY_MS_MIN + 1))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared HTML DuckDuckGo search — used by Texas and UK autopilot discovery. */
export async function searchDuckDuckGoOnce(query: string): Promise<string | null> {
  const delayMs = randomSearchDelayMs();
  console.log(`[texas-ddg] waiting ${delayMs}ms before search…`);
  await sleep(delayMs);

  const body = new URLSearchParams({ q: query });

  try {
    const res = await fetch(DDG_HTML, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": DDG_CHROME_USER_AGENT,
        Origin: "https://html.duckduckgo.com",
        Referer: "https://html.duckduckgo.com/",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    const html = await res.text();
    console.log(
      `[texas-ddg] query="${query}" status=${res.status} bodyLength=${html.length}`,
    );

    // Parse whenever we received a non-empty HTML payload (DDG may return 202 with results).
    if (html.length === 0) {
      return null;
    }

    console.log("[texas-ddg] Sample HTML body snippet:", html.substring(0, 1000));

    const { urls: candidates, liteCount, primaryCount } = extractResultUrls(html);
    console.log(
      `[texas-ddg] query="${query}" parsedCandidates=${candidates.length} liteMatches=${liteCount} primaryMatches=${primaryCount}`,
    );

    if (!res.ok && candidates.length === 0) {
      return null;
    }

    for (const url of candidates) {
      const host = hostFromUrl(url);
      if (!host || BLOCKED_HOSTS.has(host)) {
        continue;
      }
      return url;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[texas-ddg] query="${query}" fetchError=${message}`);
    return null;
  }
}

/**
 * Lightweight DuckDuckGo HTML search — no API key. Returns first plausible business website.
 */
export async function discoverWebsiteViaDuckDuckGo(input: {
  businessName: string;
  zip: string | null;
  city: string | null;
  isMobileVendor?: boolean;
}): Promise<string | null> {
  for (const category of discoveryCategories(input.isMobileVendor)) {
    const query = buildTexasDiscoverySearchQuery({
      businessName: input.businessName,
      category,
    });
    const website = await searchDuckDuckGoOnce(query);
    if (website) {
      return website;
    }
  }
  return null;
}
