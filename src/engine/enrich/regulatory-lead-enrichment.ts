import { extractContactsFromHtml, pickBestEmail, pickFirst } from "../contact-discovery/extract-from-html.js";
import { fetchPageHtml, joinUrl, normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";
import { searchDuckDuckGoOnce } from "../search/web-search-discovery.js";
import { scrapeEmailFromWebsite } from "./website-email-scraper.js";
import { isValidOutreachEmail, normalizeOutreachEmail } from "../outreach-email.js";
import {
  lookupFloridaSunbizEntity,
  lookupTexasSosEntity,
} from "./us-registry-lookup.js";

const CONTACT_PATHS = ["/", "/contact", "/contact-us", "/contactus", "/about", "/about-us"];

export type RegulatoryEnrichmentInput = {
  businessName: string;
  city: string | null;
  county?: string | null;
  zip?: string | null;
  licenseNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  region: "FLORIDA" | "TEXAS";
};

export type RegulatoryEnrichmentResult = {
  email: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  status: "ready_to_contact" | "no_contact" | "skipped_has_contact";
  enrichmentDetail: string;
  stages: string[];
};

function cleanBusinessNameForSearch(raw: string): string {
  return raw
    .replace(/\s*,?\s*(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation)\.?\s*$/gi, "")
    .replace(/[\s,;:.–—-]+$/g, "")
    .trim();
}

function buildDiscoveryQuery(input: RegulatoryEnrichmentInput): string {
  const name = cleanBusinessNameForSearch(input.businessName) || input.businessName.trim();
  const parts = [name];
  if (input.city?.trim()) {
    parts.push(input.city.trim());
  }
  if (input.licenseNumber?.trim()) {
    parts.push(`license ${input.licenseNumber.trim()}`);
  }
  if (input.region === "FLORIDA") {
    parts.push("Florida restaurant");
  } else {
    parts.push("Texas food");
  }
  return parts.join(" ");
}

function hasSocialHandle(url: string | null): boolean {
  return Boolean(url?.trim());
}

function isContactReady(result: {
  email: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
}): boolean {
  return Boolean(
    result.email?.trim() ||
      hasSocialHandle(result.facebookUrl) ||
      hasSocialHandle(result.instagramUrl),
  );
}

async function stageAWebsiteDiscovery(
  input: RegulatoryEnrichmentInput,
  stages: string[],
): Promise<string | null> {
  if (input.website?.trim()) {
    stages.push("A:existing_website");
    return normalizeWebsiteUrl(input.website.trim());
  }

  const query = buildDiscoveryQuery(input);
  try {
    const website = await searchDuckDuckGoOnce(query, "regulatory-ddg");
    if (website) {
      stages.push("A:ddg_website");
      return website;
    }
    stages.push("A:ddg_miss");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stages.push(`A:error:${message.slice(0, 80)}`);
  }
  return null;
}

async function stageBWebsiteScrape(
  website: string,
  stages: string[],
): Promise<{
  email: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
}> {
  let email: string | null = null;
  let facebookUrl: string | null = null;
  let instagramUrl: string | null = null;

  try {
    email = await scrapeEmailFromWebsite(website);
    if (email) {
      stages.push("B:scraper_email");
    }
  } catch {
    stages.push("B:scraper_error");
  }

  const siteUrl = normalizeWebsiteUrl(website);
  if (!siteUrl) {
    return { email, facebookUrl, instagramUrl };
  }

  for (const path of CONTACT_PATHS) {
    try {
      const pageUrl = joinUrl(siteUrl, path);
      const html = await fetchPageHtml(pageUrl);
      if (!html) {
        continue;
      }
      const extracted = extractContactsFromHtml(html, pageUrl);
      if (!email) {
        email = pickBestEmail(extracted.emails, siteUrl);
        if (email) {
          stages.push(`B:mailto_${path}`);
        }
      }
      if (!facebookUrl) {
        facebookUrl = pickFirst(extracted.facebookUrls);
        if (facebookUrl) {
          stages.push(`B:facebook_${path}`);
        }
      }
      if (!instagramUrl) {
        instagramUrl = pickFirst(extracted.instagramUrls);
        if (instagramUrl) {
          stages.push(`B:instagram_${path}`);
        }
      }
      if (email && facebookUrl && instagramUrl) {
        break;
      }
    } catch {
      /* continue to next path */
    }
  }

  return { email, facebookUrl, instagramUrl };
}

async function stageCRegistryLookup(
  input: RegulatoryEnrichmentInput,
  stages: string[],
): Promise<string | null> {
  try {
    if (input.region === "FLORIDA") {
      const hit = await lookupFloridaSunbizEntity(input.businessName);
      stages.push(`C:${hit.detail}`);
      return hit.email;
    }
    const hit = await lookupTexasSosEntity(input.businessName, input.city);
    stages.push(`C:${hit.detail}`);
    return hit.email;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stages.push(`C:error:${message.slice(0, 80)}`);
    return null;
  }
}

/**
 * Multi-stage contact discovery for US regulatory leads (Florida DBPR, Texas DSHS).
 */
export async function runRegulatoryLeadEnrichment(
  input: RegulatoryEnrichmentInput,
): Promise<RegulatoryEnrichmentResult> {
  const stages: string[] = [];
  const existingEmail = input.email?.trim()
    ? normalizeOutreachEmail(input.email.trim())
    : null;

  if (existingEmail && isValidOutreachEmail(existingEmail)) {
    return {
      email: existingEmail,
      website: input.website?.trim() ?? null,
      facebookUrl: null,
      instagramUrl: null,
      status: "ready_to_contact",
      enrichmentDetail: "existing_email",
      stages: ["skip:has_email"],
    };
  }

  let email: string | null = null;
  let website: string | null = input.website?.trim() ?? null;
  let facebookUrl: string | null = null;
  let instagramUrl: string | null = null;

  website = await stageAWebsiteDiscovery(input, stages);

  if (website) {
    const scraped = await stageBWebsiteScrape(website, stages);
    email = scraped.email;
    facebookUrl = scraped.facebookUrl;
    instagramUrl = scraped.instagramUrl;
  } else {
    stages.push("B:skipped_no_website");
  }

  if (!isContactReady({ email, facebookUrl, instagramUrl })) {
    const registryEmail = await stageCRegistryLookup(input, stages);
    if (registryEmail && isValidOutreachEmail(registryEmail)) {
      email = normalizeOutreachEmail(registryEmail);
      stages.push("C:email_applied");
    }
  }

  const ready = isContactReady({ email, facebookUrl, instagramUrl });
  return {
    email,
    website,
    facebookUrl,
    instagramUrl,
    status: ready ? "ready_to_contact" : "no_contact",
    enrichmentDetail: stages.join(" | "),
    stages,
  };
}
