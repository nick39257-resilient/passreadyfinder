import { productConfig } from "../../config/product.config.js";
import { PASSREADY_MAIL_FROM } from "./smtp-mail-service.js";
import { normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";
import {
  closeBrowserSafe,
  remainingMs,
  withTimeout,
} from "./service-timeout.js";

/** Hard cap per website — abort and skip if exceeded. */
export const CONTACT_FORM_SITE_BUDGET_MS = 15_000;

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
type PlaywrightBrowser = Awaited<
  ReturnType<PlaywrightModule["chromium"]["launch"]>
>;

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

async function runContactFormAttempt(input: {
  website: string;
  businessName: string;
  message?: string;
  forceSubmit?: boolean;
}): Promise<ContactFormAttemptResult> {
  const siteUrl = normalizeWebsiteUrl(input.website);
  if (!siteUrl) {
    return { submitted: false, contactPageUrl: null, reason: "invalid_website" };
  }

  const deadline = Date.now() + CONTACT_FORM_SITE_BUDGET_MS;
  const actionTimeout = () => Math.min(15_000, Math.max(1_000, remainingMs(deadline)));

  const { chromium } = await loadPlaywright();
  let browser: PlaywrightBrowser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      timeout: actionTimeout(),
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(actionTimeout());
    page.setDefaultNavigationTimeout(actionTimeout());

    let contactPageUrl: string | null = null;
    let formFound = false;

    for (const path of CONTACT_PATHS) {
      if (remainingMs(deadline) <= 0) {
        return {
          submitted: false,
          contactPageUrl,
          reason: "site_timeout_15s",
        };
      }

      const url = joinUrl(siteUrl, path);
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: actionTimeout(),
        });
      } catch {
        continue;
      }

      const hasForm = await page
        .locator("form")
        .first()
        .isVisible({ timeout: actionTimeout() })
        .catch(() => false);
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

      if (await nameField.isVisible({ timeout: actionTimeout() }).catch(() => false)) {
        await nameField.fill("Nick — PassReady", { timeout: actionTimeout() });
      }
      if (await emailField.isVisible({ timeout: actionTimeout() }).catch(() => false)) {
        await emailField.fill(
          PASSREADY_MAIL_FROM,
          { timeout: actionTimeout() },
        );
      }
      if (await messageField.isVisible({ timeout: actionTimeout() }).catch(() => false)) {
        const custom = input.message?.trim();
        const msg = custom
          ? custom
          : contactFormMessage().replace(
              "[Business Name]",
              input.businessName.trim(),
            );
        await messageField.fill(msg, { timeout: actionTimeout() });
      }

      const shouldSubmit = input.forceSubmit === true || autoSubmitEnabled();
      if (!shouldSubmit) {
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
      if (await submit.isVisible({ timeout: actionTimeout() }).catch(() => false)) {
        await submit.click({ timeout: actionTimeout() });
        await page.waitForTimeout(Math.min(2_500, remainingMs(deadline)));
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
    await closeBrowserSafe(browser);
  }
}

/**
 * Attempt to submit a website contact form (headless Chromium).
 * Default: dry-run (find form only) unless CONTACT_FORM_AUTO_SUBMIT=true.
 * Aborts after {@link CONTACT_FORM_SITE_BUDGET_MS} per website.
 */
export async function tryWebsiteContactForm(input: {
  website: string;
  businessName: string;
  message?: string;
  forceSubmit?: boolean;
}): Promise<ContactFormAttemptResult> {
  try {
    return await withTimeout(
      CONTACT_FORM_SITE_BUDGET_MS,
      "contact_form_site",
      () => runContactFormAttempt(input),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      submitted: false,
      contactPageUrl: null,
      reason: message.includes("timed out") ? "site_timeout_15s" : `contact_form_error:${message}`,
    };
  }
}
