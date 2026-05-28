import { productConfig } from "../../config/product.config.js";
import { enrichFromOsm } from "../enrich/osm-enricher.js";
import { fetchEmailFromWebsite } from "../enrich/email-from-website.js";
import { scoresFromRow } from "../intelligence/carrot.js";
import { getLeadById } from "../store/leads-repository.js";
import {
  saveContactDiscovery,
  syncDiscoveryToLead,
} from "../store/contact-discovery-repository.js";
import { calculateContactScore } from "./contact-score.js";
import {
  extractContactsFromHtml,
  normalizeWhatsApp,
  pickBestEmail,
  pickFirst,
} from "./extract-from-html.js";
import { fetchPageHtml, joinUrl, normalizeWebsiteUrl } from "./fetch-page.js";
import { isRootDisallowedByRobots } from "./robots.js";
import type { ContactDiscoveryResult, SourcedValue } from "./types.js";
import { buildChannelDrafts } from "./channel-drafts.js";
import { generateContactAiInsights } from "./ai-insights.js";

const CONTACT_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/contactus",
  "/about",
  "/about-us",
  "/get-in-touch",
];

function sourced(value: string | null, sourceUrl: string | null, confidence: number): SourcedValue {
  return { value, sourceUrl, confidence };
}

function mergeBest<T>(
  current: SourcedValue,
  next: string | null,
  sourceUrl: string | null,
  confidence: number,
): SourcedValue {
  if (!next?.trim()) {
    return current;
  }
  if (!current.value || confidence > current.confidence) {
    return sourced(next.trim(), sourceUrl, confidence);
  }
  return current;
}

function resolveLocalAuthority(): string {
  const area = productConfig.area;
  if (area.mode === "localAuthority") {
    return area.localAuthorityName;
  }
  return "local area";
}

export async function runContactDiscoveryForLead(
  leadId: number,
  onProgress?: (message: string) => void | Promise<void>,
): Promise<ContactDiscoveryResult> {
  const report = async (msg: string) => {
    await onProgress?.(msg);
  };

  const row = await getLeadById(leadId);
  if (!row) {
    throw new Error("Lead not found");
  }

  await report("Starting contact route discovery…");

  let website = row.website?.trim() ?? null;
  let phone = row.phone?.trim() ?? null;
  let email = row.email?.trim() ?? null;

  if (!website || !phone) {
    await report("Checking OpenStreetMap for phone/website…");
    try {
      const osm = await enrichFromOsm({
        fsaId: row.fsa_id,
        businessName: row.business_name,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      if (!website && osm.website?.trim()) {
        website = osm.website.trim();
      }
      if (!phone && osm.phone?.trim()) {
        phone = osm.phone.trim();
      }
    } catch {
      /* OSM optional */
    }
  }

  const accum = {
    website: sourced(website, website ? normalizeWebsiteUrl(website) : null, website ? 70 : 0),
    email: sourced(email, null, email ? 85 : 0),
    contactPage: sourced(null, null, 0) as SourcedValue,
    contactForm: false,
    contactFormSource: null as string | null,
    facebook: sourced(null, null, 0) as SourcedValue,
    instagram: sourced(null, null, 0) as SourcedValue,
    whatsapp: sourced(null, null, 0) as SourcedValue,
    phone: sourced(phone, null, phone ? 75 : 0),
  };

  const siteUrl = website ? normalizeWebsiteUrl(website) : null;
  if (siteUrl) {
    accum.website = sourced(website, siteUrl, 80);
    const disallowed = await isRootDisallowedByRobots(siteUrl);
    if (disallowed) {
      await report("robots.txt disallows scraping — using known website only");
    } else {
      await report("Scanning website pages (polite rate limit)…");
      const allEmails: string[] = [];
      const allPhones: string[] = [];
      let formDetected = false;
      let formSource: string | null = null;

      for (const path of CONTACT_PATHS) {
        const pageUrl = joinUrl(siteUrl, path);
        const html = await fetchPageHtml(pageUrl);
        if (!html) {
          continue;
        }

        if (path !== "/" && !accum.contactPage.value) {
          accum.contactPage = sourced(pageUrl, pageUrl, 70);
        }

        const extracted = extractContactsFromHtml(html, pageUrl);
        allEmails.push(...extracted.emails);
        allPhones.push(...extracted.phones);

        if (extracted.contactFormDetected && !formDetected) {
          formDetected = true;
          formSource = extracted.contactFormPageUrl;
        }

        const fb = pickFirst(extracted.facebookUrls);
        accum.facebook = mergeBest(accum.facebook, fb, fb, 75);

        const ig = pickFirst(extracted.instagramUrls);
        accum.instagram = mergeBest(accum.instagram, ig, ig, 70);

        const wa = pickFirst(extracted.whatsappLinks);
        if (wa) {
          accum.whatsapp = mergeBest(accum.whatsapp, normalizeWhatsApp(wa), wa, 80);
        }
      }

      const bestEmail = pickBestEmail(allEmails, siteUrl);
      if (bestEmail) {
        accum.email = mergeBest(accum.email, bestEmail, siteUrl, 82);
      } else {
        await report("Trying dedicated email extraction…");
        const scraped = await fetchEmailFromWebsite(siteUrl);
        if (scraped) {
          accum.email = mergeBest(accum.email, scraped, siteUrl, 85);
        }
      }

      const bestPhone = pickFirst(allPhones);
      if (bestPhone) {
        accum.phone = mergeBest(accum.phone, bestPhone, siteUrl, 78);
      }

      accum.contactForm = formDetected;
      accum.contactFormSource = formSource;
    }
  } else {
    await report("No website found — OSM/lead record only");
  }

  const contactScore = calculateContactScore({
    hasEmail: Boolean(accum.email.value),
    hasContactForm: accum.contactForm,
    hasPhone: Boolean(accum.phone.value),
    hasFacebook: Boolean(accum.facebook.value),
    hasInstagram: Boolean(accum.instagram.value),
    hasWhatsApp: Boolean(accum.whatsapp.value),
  });

  const discoveredAt = new Date().toISOString();
  const result: ContactDiscoveryResult = {
    leadId,
    website: accum.website,
    email: accum.email,
    contactPageUrl: accum.contactPage,
    contactFormDetected: accum.contactForm,
    contactFormSourceUrl: accum.contactFormSource,
    facebook: accum.facebook,
    instagram: accum.instagram,
    whatsapp: accum.whatsapp,
    phone: accum.phone,
    contactScore,
    discoveredAt,
  };

  await report("Building outreach drafts…");
  const fsaScores = scoresFromRow(row);
  const drafts = buildChannelDrafts({
    businessName: row.business_name,
    discovery: result,
    fsaScores,
    fsaRating: row.fsa_rating,
  });

  await report("AI route recommendation…");
  const insights = await generateContactAiInsights({
    businessName: row.business_name,
    businessType: row.business_type,
    postcode: row.postcode,
    localAuthority: resolveLocalAuthority(),
    fsaRating: row.fsa_rating,
    fsaScores,
    discovery: result,
  });

  await saveContactDiscovery(result, insights, drafts);
  await syncDiscoveryToLead(leadId, {
    email: result.email.value,
    phone: result.phone.value,
    website: result.website.value,
  });

  await report(`Done — contact score ${contactScore}/100`);
  return result;
}
