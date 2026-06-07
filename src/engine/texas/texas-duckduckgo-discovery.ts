import { searchDuckDuckGoOnce } from "../search/web-search-discovery.js";

const CORP_SUFFIX_PATTERN =
  /\s*,?\s*(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation)\.?\s*$/i;
const OUT_OF_BUSINESS_PREFIX =
  /^(?:OOB|Out of Business)\s*[-–:]\s*/i;

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

export { searchDuckDuckGoOnce };

/**
 * Lightweight web search — DuckDuckGo HTML/Lite/API with Mojeek fallback.
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
    const website = await searchDuckDuckGoOnce(query, "texas-ddg");
    if (website) {
      return website;
    }
  }
  return null;
}
