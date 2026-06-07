import { normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";

const DDG_HTML = "https://html.duckduckgo.com/html/";
const DDG_LITE = "https://lite.duckduckgo.com/lite/";
const DDG_API = "https://api.duckduckgo.com/";

/** Standard desktop Chrome — avoids generic Node/fetch fingerprints on Render. */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SEARCH_DELAY_MS_MIN = 2000;
const SEARCH_DELAY_MS_MAX = 5000;
const FETCH_RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 18_000;

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
  "wikipedia.org",
  "en.wikipedia.org",
  "opencorporates.com",
  "www.opencorporates.com",
  "bizapedia.com",
  "www.bizapedia.com",
  "sos.state.tx.us",
  "comptroller.texas.gov",
]);

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

function extractUrlsFromDdgApiJson(payload: unknown): string[] {
  const urls: string[] = [];
  if (!payload || typeof payload !== "object") {
    return urls;
  }

  const record = payload as {
    Results?: Array<{ FirstURL?: string }>;
    RelatedTopics?: Array<
      | { FirstURL?: string; Topics?: Array<{ FirstURL?: string }> }
      | { FirstURL?: string }
    >;
  };

  for (const result of record.Results ?? []) {
    pushUniqueUrl(urls, normalizeWebsiteUrl(result.FirstURL ?? ""));
  }

  for (const topic of record.RelatedTopics ?? []) {
    if ("FirstURL" in topic && topic.FirstURL) {
      pushUniqueUrl(urls, normalizeWebsiteUrl(topic.FirstURL));
    }
    if ("Topics" in topic && Array.isArray(topic.Topics)) {
      for (const sub of topic.Topics) {
        pushUniqueUrl(urls, normalizeWebsiteUrl(sub.FirstURL ?? ""));
      }
    }
  }

  return urls;
}

function pickFirstAllowedWebsite(candidates: string[]): string | null {
  for (const url of candidates) {
    const host = hostFromUrl(url);
    if (!host || BLOCKED_HOSTS.has(host)) {
      continue;
    }
    if (host.endsWith(".wikipedia.org")) {
      continue;
    }
    return url;
  }
  return null;
}

function randomSearchDelayMs(): number {
  return (
    SEARCH_DELAY_MS_MIN +
    Math.floor(Math.random() * (SEARCH_DELAY_MS_MAX - SEARCH_DELAY_MS_MIN + 1))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Browser-like headers so datacenter fetch looks like a normal Chrome session. */
function buildBrowserHeaders(input: {
  origin: string;
  referer: string;
  accept?: string;
  contentType?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept:
      input.accept ??
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Origin: input.origin,
    Referer: input.referer,
  };
  if (input.contentType) {
    headers["Content-Type"] = input.contentType;
  }
  return headers;
}

async function fetchWithOneRetry(
  label: string,
  logTag: string,
  doFetch: () => Promise<Response>,
): Promise<Response> {
  try {
    return await doFetch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[${logTag}] ${label} fetchError=${message} — retry in ${FETCH_RETRY_DELAY_MS}ms`);
    await sleep(FETCH_RETRY_DELAY_MS);
    return await doFetch();
  }
}

type HtmlSearchRoute = {
  name: string;
  run: () => Promise<Response>;
};

function htmlSearchRoutes(query: string, logTag: string): HtmlSearchRoute[] {
  const htmlOrigin = "https://html.duckduckgo.com";
  const liteOrigin = "https://lite.duckduckgo.com";

  return [
    {
      name: "ddg_html_post",
      run: () =>
        fetchWithOneRetry("ddg_html_post", logTag, () =>
          fetch(DDG_HTML, {
            method: "POST",
            headers: buildBrowserHeaders({
              origin: htmlOrigin,
              referer: `${htmlOrigin}/`,
              contentType: "application/x-www-form-urlencoded",
            }),
            body: new URLSearchParams({ q: query }).toString(),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }),
        ),
    },
    {
      name: "ddg_html_get",
      run: () =>
        fetchWithOneRetry("ddg_html_get", logTag, () =>
          fetch(`${DDG_HTML}?q=${encodeURIComponent(query)}`, {
            method: "GET",
            headers: buildBrowserHeaders({
              origin: htmlOrigin,
              referer: `${htmlOrigin}/`,
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }),
        ),
    },
    {
      name: "ddg_lite_post",
      run: () =>
        fetchWithOneRetry("ddg_lite_post", logTag, () =>
          fetch(DDG_LITE, {
            method: "POST",
            headers: buildBrowserHeaders({
              origin: liteOrigin,
              referer: `${liteOrigin}`,
              contentType: "application/x-www-form-urlencoded",
            }),
            body: new URLSearchParams({ q: query }).toString(),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }),
        ),
    },
  ];
}

async function searchViaDdgApi(query: string, logTag: string): Promise<string | null> {
  try {
    const res = await fetchWithOneRetry("ddg_api_json", logTag, () =>
      fetch(
        `${DDG_API}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        {
          method: "GET",
          headers: buildBrowserHeaders({
            origin: "https://duckduckgo.com",
            referer: "https://duckduckgo.com/",
            accept: "application/json,text/plain,*/*",
          }),
          signal: AbortSignal.timeout(12_000),
        },
      ),
    );
    if (!res.ok) {
      console.log(`[${logTag}] route=ddg_api_json status=${res.status}`);
      return null;
    }
    const json = (await res.json()) as unknown;
    const candidates = extractUrlsFromDdgApiJson(json);
    const picked = pickFirstAllowedWebsite(candidates);
    console.log(
      `[${logTag}] route=ddg_api_json candidates=${candidates.length} picked=${picked ?? "none"}`,
    );
    return picked;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[${logTag}] route=ddg_api_json fetchError=${message}`);
    return null;
  }
}

/** Mojeek HTML search — unauthenticated fallback when DDG blocks datacenter IPs. */
async function searchViaMojeekHtml(query: string, logTag: string): Promise<string | null> {
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithOneRetry("mojeek_html_get", logTag, () =>
      fetch(url, {
        method: "GET",
        headers: buildBrowserHeaders({
          origin: "https://www.mojeek.com",
          referer: "https://www.mojeek.com/",
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    );
    const html = await res.text();
    const urls: string[] = [];
    const patterns = [
      /<a[^>]+class=["'][^"']*title[^"']*["'][^>]+href=["']([^"']+)["']/gi,
      /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]+class=["'][^"']*title[^"']*["']/gi,
      /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    ];
    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        pushUniqueUrl(urls, normalizeWebsiteUrl(match[1] ?? ""));
      }
    }
    const picked = pickFirstAllowedWebsite(urls);
    console.log(
      `[${logTag}] route=mojeek_html_get status=${res.status} bodyLength=${html.length} candidates=${urls.length} picked=${picked ?? "none"}`,
    );
    return picked;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[${logTag}] route=mojeek_html_get fetchError=${message}`);
    return null;
  }
}

/**
 * Multi-route HTML search with browser headers, one retry per route, and fallbacks.
 * Used by Texas and UK autopilot website discovery.
 */
export async function searchDuckDuckGoOnce(
  query: string,
  logTag = "ddg-search",
): Promise<string | null> {
  const delayMs = randomSearchDelayMs();
  console.log(`[${logTag}] waiting ${delayMs}ms before search…`);
  await sleep(delayMs);

  for (const route of htmlSearchRoutes(query, logTag)) {
    try {
      const res = await route.run();
      const html = await res.text();
      console.log(
        `[${logTag}] route=${route.name} query="${query}" status=${res.status} bodyLength=${html.length}`,
      );

      if (html.length === 0) {
        continue;
      }

      const { urls: candidates, liteCount, primaryCount } = extractResultUrls(html);
      console.log(
        `[${logTag}] route=${route.name} parsedCandidates=${candidates.length} liteMatches=${liteCount} primaryMatches=${primaryCount}`,
      );

      if (!res.ok && candidates.length === 0) {
        continue;
      }

      const picked = pickFirstAllowedWebsite(candidates);
      if (picked) {
        console.log(`[${logTag}] route=${route.name} found=${picked}`);
        return picked;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[${logTag}] route=${route.name} fetchError=${message}`);
    }
  }

  const apiHit = await searchViaDdgApi(query, logTag);
  if (apiHit) {
    return apiHit;
  }

  return searchViaMojeekHtml(query, logTag);
}
