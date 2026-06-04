import { productConfig } from "../../config/product.config.js";
import { normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";

const CONTACT_PATHS = ["/contact", "/contact-us", "/contactus", "/get-in-touch", "/enquiry", "/"];

export type ContactFormAttemptResult = {
  submitted: boolean;
  contactPageUrl: string | null;
  reason: string;
};

function contactFormMessage(): string {
  return (
    process.env.CONTACT_FORM_MESSAGE?.trim() ||
    productConfig.enrichment.contactFormMessage
  );
}

function autoSubmitEnabled(): boolean {
  if (process.env.CONTACT_FORM_AUTO_SUBMIT?.trim().toLowerCase() === "true") {
    return true;
  }
  return productConfig.enrichment.contactFormAutoSubmit;
}

type PlaywrightModule = typeof import("playwright");

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await import("playwright")) as PlaywrightModule;
  } catch {
    throw new Error(
      "Playwright not installed — run: npm install playwright && npx playwright install chromium",
    );
  }
}

function joinUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}

/**
 * Attempt to submit a website contact form (headless Chromium).
 * Default: dry-run (find form only) unless CONTACT_FORM_AUTO_SUBMIT=true.
 */
export async function tryWebsiteContactForm(input: {
  website: string;
  businessName: string;
}): Promise<ContactFormAttemptResult> {
  const siteUrl = normalizeWebsiteUrl(input.website);
  if (!siteUrl) {
    return { submitted: false, contactPageUrl: null, reason: "invalid_website" };
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    let contactPageUrl: string | null = null;
    let formFound = false;

    for (const path of CONTACT_PATHS) {
      const url = joinUrl(siteUrl, path);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch {
        continue;
      }

      const hasForm = await page.locator("form").first().isVisible().catch(() => false);
      if (!hasForm) {
        continue;
      }

      contactPageUrl = url;
      formFound = true;

      const nameField = page
        .locator(
          'input[name*="name" i], input[id*="name" i], input[placeholder*="name" i]',
        )
        .first();
      const emailField = page.locator('input[type="email"], input[name*="email" i]').first();
      const messageField = page
        .locator('textarea, input[name*="message" i], [contenteditable="true"]')
        .first();

      if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill("Nick — PassReady");
      }
      if (await emailField.isVisible().catch(() => false)) {
        await emailField.fill(process.env.CONTACT_FORM_FROM_EMAIL?.trim() || "nick@passready.uk");
      }
      if (await messageField.isVisible().catch(() => false)) {
        const msg = contactFormMessage().replace("[Business Name]", input.businessName.trim());
        await messageField.fill(msg);
      }

      if (!autoSubmitEnabled()) {
        return {
          submitted: false,
          contactPageUrl,
          reason: "form_found_dry_run",
        };
      }

      const submit = page
        .locator(
          'button[type="submit"], input[type="submit"], button:has-text("Send"), button:has-text("Submit")',
        )
        .first();
      if (await submit.isVisible().catch(() => false)) {
        await submit.click();
        await page.waitForTimeout(2_500);
        return {
          submitted: true,
          contactPageUrl,
          reason: "submitted",
        };
      }

      return {
        submitted: false,
        contactPageUrl,
        reason: "form_found_no_submit_button",
      };
    }

    if (!formFound) {
      return { submitted: false, contactPageUrl: null, reason: "no_contact_form" };
    }
    return { submitted: false, contactPageUrl, reason: "unknown" };
  } finally {
    await browser.close();
  }
}
