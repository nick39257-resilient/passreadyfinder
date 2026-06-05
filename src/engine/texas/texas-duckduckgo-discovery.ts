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

async function searchDuckDuckGoOnce(query: string): Promise<string | null> {
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

    if (!res.ok) {
      return null;
    }

    const candidates = extractResultUrls(html);
    console.log(`[texas-ddg] query="${query}" parsedCandidates=${candidates.length}`);

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
