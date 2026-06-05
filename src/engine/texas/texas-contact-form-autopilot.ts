import { normalizeWebsiteUrl } from "../contact-discovery/fetch-page.js";
import {
  CONTACT_FORM_SITE_BUDGET_MS,
  type ContactFormAttemptResult,
} from "../services/contact-form-service.js";
import {
  closeBrowserSafe,
  remainingMs,
  withTimeout,
} from "../services/service-timeout.js";

const CONTACT_PATHS = ["/contact", "/contact-us", "/contactus", "/get-in-touch", "/enquiry", "/"];
const CONTACT_LINK_PATTERN =
  /contact(\s+us)?|connect|drop a line|get in touch|enquiry|reach out/i;

import type { Page } from "playwright";

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

async function pageHasCaptcha(page: Page): Promise<boolean> {
  const selectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    ".g-recaptcha",
    "#captcha",
    '[class*="captcha" i]',
    '[id*="captcha" i]',
  ];
  for (const selector of selectors) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (visible) {
      return true;
    }
  }
  const html = await page.content();
  return /recaptcha|hcaptcha|g-recaptcha|cf-turnstile/i.test(html);
}

async function collectContactUrlsFromAnchors(
  page: Page,
  baseUrl: string,
): Promise<string[]> {
  const urls: string[] = [];
  const anchors = await page.locator("a[href]").all();
  for (const anchor of anchors) {
    const text = (await anchor.innerText().catch(() => "")).trim();
    if (!text || !CONTACT_LINK_PATTERN.test(text)) {
      continue;
    }
    const href = await anchor.getAttribute("href");
    if (!href?.trim() || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    try {
      urls.push(new URL(href, baseUrl).toString());
    } catch {
      /* ignore bad href */
    }
  }
  return [...new Set(urls)];
}

async function tryFillAndSubmitForm(input: {
  page: Page;
  message: string;
  senderName: string;
  senderEmail: string;
  actionTimeout: () => number;
}): Promise<ContactFormAttemptResult & { captcha?: boolean }> {
  const page = input.page;

  const hasForm = await page
    .locator("form")
    .first()
    .isVisible({ timeout: input.actionTimeout() })
    .catch(() => false);
  if (!hasForm) {
    return { submitted: false, contactPageUrl: null, reason: "no_contact_form" };
  }

  if (await pageHasCaptcha(page)) {
    return {
      submitted: false,
      contactPageUrl: null,
      reason: "captcha_skipped",
      captcha: true,
    };
  }

  const nameField = page
    .locator(
      'input[name*="name" i], input[id*="name" i], input[placeholder*="name" i]',
    )
    .first();
  const emailField = page.locator('input[type="email"], input[name*="email" i]').first();
  const messageField = page
    .locator('textarea, input[name*="message" i], [contenteditable="true"]')
    .first();

  if (await nameField.isVisible({ timeout: input.actionTimeout() }).catch(() => false)) {
    await nameField.fill(input.senderName, { timeout: input.actionTimeout() });
  }
  if (await emailField.isVisible({ timeout: input.actionTimeout() }).catch(() => false)) {
    await emailField.fill(input.senderEmail, { timeout: input.actionTimeout() });
  }
  if (await messageField.isVisible({ timeout: input.actionTimeout() }).catch(() => false)) {
    await messageField.fill(input.message, { timeout: input.actionTimeout() });
  }

  const submit = page
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Send"), button:has-text("Submit")',
    )
    .first();
  if (!(await submit.isVisible({ timeout: input.actionTimeout() }).catch(() => false))) {
    return { submitted: false, contactPageUrl: null, reason: "form_found_no_submit_button" };
  }

  await submit.click({ timeout: input.actionTimeout() });
  await page.waitForTimeout(Math.min(2_500, input.actionTimeout()));
  return { submitted: true, contactPageUrl: null, reason: "submitted" };
}

async function runTexasAutopilotContactFormInner(input: {
  website: string;
  businessName: string;
  message: string;
  senderName: string;
  senderEmail: string;
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
    browser = await chromium.launch({ headless: true, timeout: actionTimeout() });
    const page = await browser.newPage();
    page.setDefaultTimeout(actionTimeout());
    page.setDefaultNavigationTimeout(actionTimeout());

    const urlsToTry: string[] = [];

    try {
      await page.goto(siteUrl, {
        waitUntil: "domcontentloaded",
        timeout: actionTimeout(),
      });
      urlsToTry.push(...(await collectContactUrlsFromAnchors(page, siteUrl)));
    } catch {
      /* continue with path probes */
    }

    for (const path of CONTACT_PATHS) {
      urlsToTry.push(joinUrl(siteUrl, path));
    }

    const seen = new Set<string>();
    for (const url of urlsToTry) {
      if (remainingMs(deadline) <= 0) {
        return { submitted: false, contactPageUrl: null, reason: "site_timeout_15s" };
      }
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);

      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: actionTimeout(),
        });
      } catch {
        continue;
      }

      const attempt = await tryFillAndSubmitForm({
        page,
        message: input.message,
        senderName: input.senderName,
        senderEmail: input.senderEmail,
        actionTimeout,
      });

      if (attempt.captcha) {
        return { submitted: false, contactPageUrl: url, reason: "captcha_skipped" };
      }
      if (attempt.submitted) {
        return {
          submitted: true,
          contactPageUrl: url,
          reason: "submitted",
        };
      }
      if (attempt.reason === "form_found_no_submit_button") {
        return { submitted: false, contactPageUrl: url, reason: attempt.reason };
      }
    }

    return { submitted: false, contactPageUrl: null, reason: "no_contact_form" };
  } finally {
    await closeBrowserSafe(browser);
  }
}

export async function tryTexasAutopilotContactForm(input: {
  website: string;
  businessName: string;
  message: string;
  senderName: string;
  senderEmail: string;
}): Promise<ContactFormAttemptResult> {
  try {
    return await withTimeout(
      CONTACT_FORM_SITE_BUDGET_MS,
      "texas_autopilot_contact_form",
      () => runTexasAutopilotContactFormInner(input),
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
