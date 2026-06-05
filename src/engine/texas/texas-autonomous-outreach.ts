import { scrapeEmailFromWebsite } from "../enrich/website-email-scraper.js";
import { tryTexasAutopilotContactForm } from "./texas-contact-form-autopilot.js";
import { discoverWebsiteViaDuckDuckGo } from "./texas-duckduckgo-discovery.js";
import { buildTexasPitchScript } from "./texas-multi-channel.js";
import { runMigrations } from "../store/db.js";
import {
  getTexasLeadsForAutopilot,
  markTexasLeadEmailDiscovered,
  markTexasLeadFormSubmitted,
  updateTexasLeadWebsite,
  type TexasLeadRow,
} from "../store/texas-leads-repository.js";
import { texasProductConfig } from "../../config/product.texas.config.js";

export type TexasAutopilotOutcome =
  | "email_discovered"
  | "form_submitted"
  | "captcha_skipped"
  | "no_website"
  | "no_contact_path"
  | "skipped_has_email"
  | "error";

export type TexasAutopilotLeadResult = {
  leadId: number;
  businessName: string;
  outcome: TexasAutopilotOutcome;
  detail: string;
  email?: string | null;
  website?: string | null;
};

export type TexasAutopilotSummary = {
  scanned: number;
  emailDiscovered: number;
  formSubmitted: number;
  captchaSkipped: number;
  noContact: number;
  errors: number;
};

function autopilotFromEmail(): string {
  return (
    process.env.CONTACT_FORM_FROM_EMAIL?.trim() ||
    process.env.FROM_EMAIL?.trim() ||
    "compliance@passready.us"
  );
}

function delayMs(): number {
  return Number(process.env.TEXAS_AUTOPILOT_DELAY_MS) || 1500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pitchForLead(row: TexasLeadRow): string {
  return buildTexasPitchScript({
    businessName: row.business_name,
    zip: row.zip,
    city: row.city,
    address: row.address,
    county: row.county,
    demerits: row.demerits,
    texasRiskScore: row.risk_score,
    hb2844DraftPreview: row.draft_message,
    isMobileVendor: row.is_mobile_vendor === 1,
    status: row.status,
  });
}

async function resolveWebsite(row: TexasLeadRow): Promise<string | null> {
  if (row.website?.trim()) {
    return row.website.trim();
  }
  const discovered = await discoverWebsiteViaDuckDuckGo({
    businessName: row.business_name,
    zip: row.zip,
    city: row.city,
  });
  if (discovered) {
    await updateTexasLeadWebsite({ leadId: row.id, website: discovered });
  }
  return discovered;
}

export async function runTexasAutopilotForLead(
  row: TexasLeadRow,
): Promise<TexasAutopilotLeadResult> {
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
        detail: "duckduckgo_no_result",
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
      await markTexasLeadEmailDiscovered({
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

    const form = await tryTexasAutopilotContactForm({
      website,
      businessName: row.business_name,
      message: pitchForLead(row),
      senderName: "PassReady Compliance Desk",
      senderEmail: autopilotFromEmail(),
    });

    if (form.submitted) {
      await markTexasLeadFormSubmitted({
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

export async function runTexasAutonomousOutreachBatch(options?: {
  limit?: number;
}): Promise<TexasAutopilotSummary> {
  await runMigrations();

  const limit =
    options?.limit ??
    (Number(process.env.TEXAS_AUTOPILOT_LIMIT) ||
      texasProductConfig.enrichment.autopilotBatchLimit);

  const leads = await getTexasLeadsForAutopilot(limit);
  const summary: TexasAutopilotSummary = {
    scanned: 0,
    emailDiscovered: 0,
    formSubmitted: 0,
    captchaSkipped: 0,
    noContact: 0,
    errors: 0,
  };

  console.log(`Texas autopilot: ${leads.length} lead(s) (risk score order, limit ${limit})\n`);

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i];
    const result = await runTexasAutopilotForLead(row);
    summary.scanned++;

    if (result.outcome === "email_discovered") {
      summary.emailDiscovered++;
      console.log(`✓ [${row.risk_score}] ${result.businessName}: ${result.email} (${result.detail})`);
    } else if (result.outcome === "form_submitted") {
      summary.formSubmitted++;
      console.log(`⊕ [${row.risk_score}] ${result.businessName}: contact form submitted`);
    } else if (result.outcome === "captcha_skipped") {
      summary.captchaSkipped++;
      console.log(`⊘ [${row.risk_score}] ${result.businessName}: CAPTCHA_SKIPPED`);
    } else if (result.outcome === "no_website" || result.outcome === "no_contact_path") {
      summary.noContact++;
      console.log(`— [${row.risk_score}] ${result.businessName}: ${result.detail}`);
    } else if (result.outcome === "error") {
      summary.errors++;
      console.log(`✗ [${row.risk_score}] ${result.businessName}: ${result.detail}`);
    } else {
      console.log(`· [${row.risk_score}] ${result.businessName}: ${result.detail}`);
    }

    if (i < leads.length - 1) {
      await sleep(delayMs());
    }
  }

  return summary;
}
