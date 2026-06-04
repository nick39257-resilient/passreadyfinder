import { pickBusinessEmail } from "../enrich/email-from-website.js";
import { harvestEmailsFromHtml } from "../enrich/website-email-scraper.js";

export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  facebookUrls: string[];
  instagramUrls: string[];
  whatsappLinks: string[];
  contactFormDetected: boolean;
  contactFormPageUrl: string | null;
}

const UK_PHONE_RE =
  /(?:\+44\s?|0)(?:\d[\s-]?){9,12}\d|(?:\+44\s?7\d{3}|\(?0(?:1|2|3|7)\d{2,4}\)?)\s?\d[\s-]?\d{3,4}[\s-]?\d{3,4}/g;

const FACEBOOK_RE =
  /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+(?:\/[^\s"'<>]*)?/gi;
const INSTAGRAM_RE =
  /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+(?:\/[^\s"'<>]*)?/gi;
const WHATSAPP_RE =
  /(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<>]+|whatsapp:\/\/send\?[^\s"'<>]+)/gi;

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 10) {
    return null;
  }
  return raw.replace(/\s+/g, " ").trim();
}

export function extractContactsFromHtml(html: string, pageUrl: string): ExtractedContacts {
  const emails = harvestEmailsFromHtml(html, pageUrl);
  const phones = uniqueNonEmpty(
    [...html.matchAll(UK_PHONE_RE)].map((m) => normalizePhone(m[0] ?? "")).filter(Boolean) as string[],
  );
  const facebookUrls = uniqueNonEmpty([...html.matchAll(FACEBOOK_RE)].map((m) => m[0] ?? ""));
  const instagramUrls = uniqueNonEmpty([...html.matchAll(INSTAGRAM_RE)].map((m) => m[0] ?? ""));
  const whatsappLinks = uniqueNonEmpty([...html.matchAll(WHATSAPP_RE)].map((m) => m[0] ?? ""));

  const contactFormDetected = detectContactForm(html);
  return {
    emails,
    phones,
    facebookUrls,
    instagramUrls,
    whatsappLinks,
    contactFormDetected,
    contactFormPageUrl: contactFormDetected ? pageUrl : null,
  };
}

function detectContactForm(html: string): boolean {
  const lower = html.toLowerCase();
  if (!lower.includes("<form")) {
    return false;
  }
  const hasEmailField =
    /type=["']email["']/i.test(html) ||
    /name=["'][^"']*email[^"']*["']/i.test(html);
  const hasTextArea = /<textarea/i.test(html);
  const actionContact = /action=["'][^"']*(contact|enquir|message)[^"']*["']/i.test(html);
  return hasEmailField || (hasTextArea && actionContact) || /contact-form|wpcf7|forminator/i.test(html);
}

export function pickBestEmail(candidates: string[], websiteUrl: string | null): string | null {
  return pickBusinessEmail(candidates, websiteUrl);
}

export function pickFirst<T>(arr: T[]): T | null {
  return arr[0] ?? null;
}

export function normalizeWhatsApp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("http") || trimmed.startsWith("whatsapp:")) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `https://wa.me/${digits}`;
  }
  return trimmed;
}
