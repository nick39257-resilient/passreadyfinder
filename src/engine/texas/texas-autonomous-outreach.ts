import { scrapeEmailFromWebsite } from "../enrich/website-email-scraper.js";
import { tryTexasAutopilotContactForm } from "./texas-contact-form-autopilot.js";
import { discoverWebsiteViaDuckDuckGo } from "./texas-duckduckgo-discovery.js";
import { runMigrations } from "../store/db.js";
import {
  getTexasLeadsForAutopilot,
  markTexasLeadEmailDiscovered,
  markTexasLeadFormSubmitted,
  updateTexasLeadWebsite,
  type TexasLeadRow,
} from "../store/texas-leads-repository.js";
import { texasProductConfig } from "../../config/product.texas.config.js";
import { getTexasAutopilotScoreUrl } from "../../config/score-urls.js";
import { getEmailUser } from "../services/smtp-mail-service.js";

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

const AUTOPILOT_SENDER_TITLE = "PassReady US Compliance Compliance Desk";

function autopilotReplyEmail(): string {
  return getEmailUser();
}

function autopilotSenderName(): string {
  return `Nick Clark, ${AUTOPILOT_SENDER_TITLE}`;
}

function autopilotSignatureLine(): string {
  return `${autopilotSenderName()} (${autopilotReplyEmail()})`;
}

function buildAutopilotFormMessage(): string {
  const scoreUrl = getTexasAutopilotScoreUrl();
  return `Hey team,

I noticed your recent health inspection score. With the new Texas HB 2844 compliance regulations taking full effect this July, DSHS is completely changing how food units have to log their chain of custody.

State inspectors will soon have the authority to pause operations on-site if logs are still being managed on manual paper tracking systems. We built PassReady specifically for Texas hospitality operators to automate these compliance logs, digitize your records, and protect your license before the July 1st deadline.

Free score check for your operation — no sign-up:
${scoreUrl}

Who is the best person to pass a free temporary access link to so you can see your pre-filled logs?

Thanks,
${autopilotSignatureLine()}`;
}

function delayMs(): number {
  return Number(process.env.TEXAS_AUTOPILOT_DELAY_MS) || 1500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pitchForLead(_row: TexasLeadRow): string {
  return buildAutopilotFormMessage();
}

async function resolveWebsite(row: TexasLeadRow): Promise<string | null> {
  if (row.website?.trim()) {
    return row.website.trim();
  }
  const discovered = await discoverWebsiteViaDuckDuckGo({
    businessName: row.business_name,
    zip: row.zip,
    city: row.city,
    isMobileVendor: row.is_mobile_vendor === 1,
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
      senderName: autopilotSenderName(),
      senderEmail: autopilotReplyEmail(),
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
