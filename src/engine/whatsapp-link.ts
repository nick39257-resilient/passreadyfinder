import { productConfig } from "../config/product.config.js";

/** Strip to digits suitable for https://wa.me/{digits} */
export function normalizeWhatsAppDigits(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const waMe = trimmed.match(/wa\.me\/(\d+)/i);
  if (waMe?.[1]) {
    return waMe[1];
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

  return digits.length >= 10 ? digits : null;
}

export function buildOutboundWaMeLink(input: {
  businessName: string;
  phone?: string | null;
  whatsapp?: string | null;
  prefillTemplate?: string;
}): string | null {
  const digits =
    normalizeWhatsAppDigits(input.whatsapp) ?? normalizeWhatsAppDigits(input.phone);
  if (!digits) {
    return null;
  }

  const template =
    input.prefillTemplate?.trim() || productConfig.outreach.whatsappOutboundTemplate;
  const prefill = template.replace("[Business Name]", input.businessName.trim());
  return `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}`;
}
