import { productConfig } from "../../config/product.config.js";
import { getUkAutopilotScoreUrl } from "../../config/score-urls.js";
import { buildTrackedLandingUrl } from "../outreach-landing-url.js";
import { scrapeEmailFromWebsite } from "../enrich/website-email-scraper.js";
import { enrichFromOsm } from "../enrich/osm-enricher.js";
import { getDefaultReplyToEmail } from "../services/resend-mail-service.js";
import { tryTexasAutopilotContactForm } from "../texas/texas-contact-form-autopilot.js";
import { runMigrations } from "../store/db.js";
import type { LeadRow } from "../store/leads-repository.js";
import {
  getUkLeadsForAutopilot,
  markUkLeadEmailDiscovered,
  updateUkLeadWebsite,
} from "../store/leads-autopilot-repository.js";
import { markLeadFormSubmitted } from "../store/leads-enrichment-repository.js";
import { discoverUkWebsiteViaDuckDuckGo } from "./uk-duckduckgo-discovery.js";
import { closeSharedChromiumBrowser } from "../services/playwright-browser.js";

function ukAutopilotContactFormsEnabled(): boolean {
  const raw = process.env.UK_AUTOPILOT_CONTACT_FORMS?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") {
    return false;
  }
  return true;
}

export type UkAutopilotOutcome =
  | "email_discovered"
  | "form_submitted"
  | "captcha_skipped"
  | "no_website"
  | "no_contact_path"
  | "skipped_has_email"
  | "error";

export type UkAutopilotLeadResult = {
  leadId: number;
  businessName: string;
  outcome: UkAutopilotOutcome;
  detail: string;
  email?: string | null;
  website?: string | null;
};

export type UkAutopilotSummary = {
  scanned: number;
  emailDiscovered: number;
  formSubmitted: number;
  captchaSkipped: number;
  noContact: number;
  errors: number;
};

const AUTOPILOT_SENDER_TITLE = "PassReady UK Compliance Desk";

function autopilotReplyEmail(): string {
  return getDefaultReplyToEmail();
}

function autopilotSenderName(): string {
  return `Nick Clark, ${AUTOPILOT_SENDER_TITLE}`;
}

function autopilotSignatureLine(): string {
  return `${autopilotSenderName()} (${autopilotReplyEmail()})`;
}

function buildAutopilotFormMessage(row: LeadRow): string {
  const scoreUrl = buildTrackedLandingUrl(getUkAutopilotScoreUrl(), row.fsa_id);
  return `Hey team,

I'm a kitchen manager in Preston and built PassReady for our takeaway team (EHO checklists, allergens, multilingual staff).

We put together a free FSA score check for ${row.business_name} — no sign-up:
${scoreUrl}

Who is the best person to pass a 7-day trial link to?

Thanks,
${autopilotSignatureLine()}`;
}

function delayMs(): number {
  return (
    Number(process.env.UK_AUTOPILOT_DELAY_MS) ||
    productConfig.enrichment.ukAutopilotDelayMs
  );
}

function batchLimit(options?: { limit?: number }): number {
  const fromOptions = options?.limit;
  if (fromOptions !== undefined && Number.isFinite(fromOptions) && fromOptions > 0) {
    return fromOptions;
  }
  const fromEnv = Number(process.env.UK_AUTOPILOT_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return productConfig.enrichment.ukAutopilotBatchLimit;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveWebsite(row: LeadRow): Promise<string | null> {
  if (row.website?.trim()) {
    return row.website.trim();
  }

  try {
    const osm = await enrichFromOsm({
      fsaId: row.fsa_id,
      businessName: row.business_name,
      latitude: row.latitude,
      longitude: row.longitude,
    });
    if (osm.website?.trim()) {
      await updateUkLeadWebsite({ leadId: row.id, website: osm.website.trim() });
      return osm.website.trim();
    }
  } catch {
    /* OSM optional — fall through to DuckDuckGo */
  }

  const discovered = await discoverUkWebsiteViaDuckDuckGo({
    businessName: row.business_name,
    postcode: row.postcode,
    businessType: row.business_type,
  });
  if (discovered) {
    await updateUkLeadWebsite({ leadId: row.id, website: discovered });
  }
  return discovered;
}

export async function runUkAutopilotForLead(row: LeadRow): Promise<UkAutopilotLeadResult> {
  if (row.email?.trim()) {
    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "skipped_has_email",
      detail: "already_has_email",
      email: row.email,
    };
  }

  try {
    let website: string | null = null;
    try {
      website = await resolveWebsite(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "error",
        detail: `website_discovery:${message}`,
      };
    }

    if (!website) {
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "no_website",
        detail: "osm_and_duckduckgo_no_result",
      };
    }

    let email: string | null = null;
    try {
      email = await scrapeEmailFromWebsite(website);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "error",
        detail: `email_scrape:${message}`,
        website,
      };
    }

    if (email) {
      await markUkLeadEmailDiscovered({
        leadId: row.id,
        email,
        website,
      });
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "email_discovered",
        detail: "homepage_or_contact_scrape",
        email,
        website,
      };
    }

    if (!ukAutopilotContactFormsEnabled()) {
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "no_contact_path",
        detail: "contact_forms_disabled_on_cron",
        website,
      };
    }

    const form = await tryTexasAutopilotContactForm({
      website,
      businessName: row.business_name,
      message: buildAutopilotFormMessage(row),
      senderName: autopilotSenderName(),
      senderEmail: autopilotReplyEmail(),
    });

    if (form.submitted) {
      await markLeadFormSubmitted({
        leadId: row.id,
        contactPageUrl: form.contactPageUrl,
      });
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "form_submitted",
        detail: form.reason,
        website,
      };
    }

    if (form.reason === "captcha_skipped") {
      return {
        leadId: row.id,
        businessName: row.business_name,
        outcome: "captcha_skipped",
        detail: "CAPTCHA_SKIPPED",
        website,
      };
    }

    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "no_contact_path",
      detail: form.reason,
      website,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      leadId: row.id,
      businessName: row.business_name,
      outcome: "error",
      detail: message,
    };
  }
}

export async function runUkAutonomousOutreachBatch(options?: {
  limit?: number;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<UkAutopilotSummary> {
  await runMigrations();

  const limit = batchLimit(options);
  const leads = await getUkLeadsForAutopilot(limit);
  const summary: UkAutopilotSummary = {
    scanned: 0,
    emailDiscovered: 0,
    formSubmitted: 0,
    captchaSkipped: 0,
    noContact: 0,
    errors: 0,
  };

  console.log(`UK autopilot: ${leads.length} lead(s) (lead score order, limit ${limit})\n`);

  try {
    for (let i = 0; i < leads.length; i++) {
      const row = leads[i];
      await options?.onProgress?.(
        `UK autopilot: ${i + 1}/${leads.length} — ${row.business_name}`,
      );
      const result = await runUkAutopilotForLead(row);
      summary.scanned++;

      if (result.outcome === "email_discovered") {
        summary.emailDiscovered++;
        console.log(`✓ [${row.lead_score}] ${result.businessName}: ${result.email} (${result.detail})`);
      } else if (result.outcome === "form_submitted") {
        summary.formSubmitted++;
        console.log(`⊕ [${row.lead_score}] ${result.businessName}: contact form submitted`);
      } else if (result.outcome === "captcha_skipped") {
        summary.captchaSkipped++;
        console.log(`⊘ [${row.lead_score}] ${result.businessName}: CAPTCHA_SKIPPED`);
      } else if (result.outcome === "no_website" || result.outcome === "no_contact_path") {
        summary.noContact++;
        console.log(`— [${row.lead_score}] ${result.businessName}: ${result.detail}`);
      } else if (result.outcome === "error") {
        summary.errors++;
        console.log(`✗ [${row.lead_score}] ${result.businessName}: ${result.detail}`);
      } else {
        console.log(`· [${row.lead_score}] ${result.businessName}: ${result.detail}`);
      }

      if (i < leads.length - 1) {
        await sleep(delayMs());
      }
    }
  } finally {
    await closeSharedChromiumBrowser();
  }

  return summary;
}
