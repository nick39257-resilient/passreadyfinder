import { searchDuckDuckGoOnce } from "../search/web-search-discovery.js";

const UK_CORP_SUFFIX_PATTERN =
  /\s*,?\s*(Ltd\.?|Limited|PLC|P\.L\.C\.|LLP|CIC|Inc\.?)\.?\s*$/i;

type UkDiscoveryCategory = "takeaway" | "restaurant" | "catering";

/** Strip Ltd/Limited/PLC suffixes before DuckDuckGo lookup. */
export function cleanUkBusinessNameForSearch(raw: string): string {
  let name = raw.trim();
  if (!name) {
    return "";
  }

  let previous = "";
  while (previous !== name) {
    previous = name;
    name = name.replace(UK_CORP_SUFFIX_PATTERN, "").trim();
  }

  return name.replace(/[\s,;:.–—-]+$/g, "").trim();
}

function discoveryCategories(businessType: string | null): UkDiscoveryCategory[] {
  const type = businessType?.toLowerCase() ?? "";
  if (type.includes("mobile")) {
    return ["catering", "takeaway"];
  }
  if (type.includes("takeaway") || type.includes("sandwich")) {
    return ["takeaway", "restaurant"];
  }
  return ["restaurant", "takeaway"];
}

function buildUkDiscoverySearchQuery(input: {
  businessName: string;
  postcode: string | null;
  category: UkDiscoveryCategory;
}): string {
  const cleaned = cleanUkBusinessNameForSearch(input.businessName);
  const name = cleaned || input.businessName.trim();
  const locality = input.postcode?.trim() || "UK";
  return `${name} ${locality} ${input.category}`;
}

/**
 * Lightweight DuckDuckGo HTML search for UK FSA leads — no API key.
 */
export async function discoverUkWebsiteViaDuckDuckGo(input: {
  businessName: string;
  postcode: string | null;
  businessType?: string | null;
}): Promise<string | null> {
  for (const category of discoveryCategories(input.businessType ?? null)) {
    const query = buildUkDiscoverySearchQuery({
      businessName: input.businessName,
      postcode: input.postcode,
      category,
    });
    console.log(`[uk-ddg] searching: ${query}`);
    const website = await searchDuckDuckGoOnce(query, "uk-ddg");
    if (website) {
      console.log(`[uk-ddg] found: ${website}`);
      return website;
    }
  }
  return null;
}
