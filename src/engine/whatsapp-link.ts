import { productConfig } from "../config/product.config.js";
import { getOutreachLandingUrl } from "./outreach-landing-url.js";

/** OSM often lists shop landlines (01/02/03…) — those are rarely on WhatsApp. */
export function isLikelyUkMobile(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return false;
  }
  if (/wa\.me\//i.test(trimmed) || /whatsapp/i.test(trimmed)) {
    return true;
  }

  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("44")) {
    return digits.length === 12 && digits[2] === "7";
  }
  if (digits.startsWith("0")) {
    return digits.startsWith("07") && digits.length >= 11;
  }
  return digits.length === 10 && digits.startsWith("7");
}

/** Strip to digits suitable for https://wa.me/{digits} (UK mobile or explicit wa.me only). */
export function normalizeWhatsAppDigits(
  raw: string | null | undefined,
  options?: { allowLandline?: boolean },
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const waMe = trimmed.match(/wa\.me\/(\d+)/i);
  if (waMe?.[1]) {
    return waMe[1];
  }

  if (!options?.allowLandline && !isLikelyUkMobile(trimmed)) {
    return null;
  }

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0") && digits.length >= 10) {
    digits = `44${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith("7")) {
    digits = `44${digits}`;
  }

  if (!options?.allowLandline && digits.startsWith("44") && digits[2] !== "7") {
    return null;
  }

  return digits.length >= 10 ? digits : null;
}

export function buildOutboundWaMeLink(input: {
  businessName: string;
  phone?: string | null;
  whatsapp?: string | null;
  prefillTemplate?: string;
  /** Tracked SafeScore URL (with ?rid=) — defaults to untracked getOutreachLandingUrl(). */
  landingUrl?: string;
}): string | null {
  const fromWhatsapp = normalizeWhatsAppDigits(input.whatsapp);
  const fromPhone = normalizeWhatsAppDigits(input.phone);
  const digits = fromWhatsapp ?? fromPhone;
  if (!digits) {
    return null;
  }

  const template =
    input.prefillTemplate?.trim() || productConfig.outreach.whatsappOutboundTemplate;
  const prefill = template.replace("[Business Name]", input.businessName.trim());
  const landing =
    input.landingUrl !== undefined
      ? input.landingUrl.trim()
      : getOutreachLandingUrl();
  const body =
    !landing || prefill.includes(landing)
      ? prefill
      : `${prefill}\n\nFree score check: ${landing}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}
