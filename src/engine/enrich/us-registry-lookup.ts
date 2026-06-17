import { extractEmailsFromText, pickBusinessEmail } from "./email-from-website.js";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type RegistryLookupResult = {
  email: string | null;
  registeredAgent: string | null;
  sourceUrl: string | null;
  detail: string;
};

async function fetchRegistryHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(14_000),
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

function cleanEntityNameForRegistry(raw: string): string {
  return raw
    .replace(/\s*,?\s*(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation)\.?\s*$/gi, "")
    .replace(/[\s,;:.–—-]+$/g, "")
    .trim();
}

function extractRegisteredAgent(html: string): string | null {
  const patterns = [
    /Registered\s+Agent\s*Name[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)/i,
    /Registered\s+Agent[^<]*<\/td>\s*<td[^>]*>([^<]+)/i,
    /RA\s+Name[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    const value = match?.[1]?.trim();
    if (value && value.length > 2) {
      return value;
    }
  }
  return null;
}

function pickEmailFromHtml(html: string, sourceUrl: string | null): string | null {
  const candidates = extractEmailsFromText(html);
  return pickBusinessEmail(candidates, sourceUrl);
}

/**
 * Florida Sunbiz entity search — best-effort registered agent + any public email on detail page.
 */
export async function lookupFloridaSunbizEntity(
  businessName: string,
): Promise<RegistryLookupResult> {
  const term = encodeURIComponent(cleanEntityNameForRegistry(businessName) || businessName.trim());
  if (!term) {
    return { email: null, registeredAgent: null, sourceUrl: null, detail: "empty_name" };
  }

  const searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchTerm=${term}&searchNameOrder=`;
  const searchHtml = await fetchRegistryHtml(searchUrl);
  if (!searchHtml) {
    return { email: null, registeredAgent: null, sourceUrl: searchUrl, detail: "sunbiz_search_failed" };
  }

  const detailPath = searchHtml.match(
    /href="(\/Inquiry\/CorporationSearch\/SearchResultDetail[^"]+)"/i,
  )?.[1];
  if (!detailPath) {
    return { email: null, registeredAgent: null, sourceUrl: searchUrl, detail: "sunbiz_no_match" };
  }

  const detailUrl = `https://search.sunbiz.org${detailPath.replace(/&amp;/g, "&")}`;
  const detailHtml = await fetchRegistryHtml(detailUrl);
  if (!detailHtml) {
    return {
      email: null,
      registeredAgent: null,
      sourceUrl: detailUrl,
      detail: "sunbiz_detail_failed",
    };
  }

  const registeredAgent = extractRegisteredAgent(detailHtml);
  const email = pickEmailFromHtml(detailHtml, detailUrl);
  return {
    email,
    registeredAgent,
    sourceUrl: detailUrl,
    detail: email ? "sunbiz_email" : registeredAgent ? "sunbiz_agent" : "sunbiz_no_contact",
  };
}

/**
 * Texas SOS public filing search — scrape any email from the first matching detail page.
 */
export async function lookupTexasSosEntity(
  businessName: string,
  city?: string | null,
): Promise<RegistryLookupResult> {
  const cleaned = cleanEntityNameForRegistry(businessName) || businessName.trim();
  if (!cleaned) {
    return { email: null, registeredAgent: null, sourceUrl: null, detail: "empty_name" };
  }

  const cityPart = city?.trim() ? ` ${city.trim()}` : "";
  const searchUrl = `https://direct.sos.state.tx.us/corp/sosda/action/EntitySearch?searchType=1&searchTerm=${encodeURIComponent(cleaned)}`;
  const searchHtml = await fetchRegistryHtml(searchUrl);
  if (searchHtml) {
    const email = pickEmailFromHtml(searchHtml, searchUrl);
    const agent = extractRegisteredAgent(searchHtml);
    if (email || agent) {
      return {
        email,
        registeredAgent: agent,
        sourceUrl: searchUrl,
        detail: email ? "texas_sos_email" : "texas_sos_agent",
      };
    }
  }

  const { searchDuckDuckGoOnce } = await import("../search/web-search-discovery.js");
  const ddgQuery = `"${cleaned}"${cityPart} site:sos.state.tx.us OR site:comptroller.texas.gov`;
  const sosPage = await searchDuckDuckGoOnce(ddgQuery, "texas-sos-ddg");
  if (!sosPage) {
    return { email: null, registeredAgent: null, sourceUrl: searchUrl, detail: "texas_sos_no_match" };
  }

  const detailHtml = await fetchRegistryHtml(sosPage);
  if (!detailHtml) {
    return { email: null, registeredAgent: null, sourceUrl: sosPage, detail: "texas_sos_detail_failed" };
  }

  return {
    email: pickEmailFromHtml(detailHtml, sosPage),
    registeredAgent: extractRegisteredAgent(detailHtml),
    sourceUrl: sosPage,
    detail: "texas_sos_scraped",
  };
}
