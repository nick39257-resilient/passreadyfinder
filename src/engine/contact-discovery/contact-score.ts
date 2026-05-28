/** Contact Score 0–100 per product spec. */
export function calculateContactScore(input: {
  hasEmail: boolean;
  hasContactForm: boolean;
  hasPhone: boolean;
  hasFacebook: boolean;
  hasInstagram: boolean;
  hasWhatsApp: boolean;
}): number {
  let score = 0;
  if (input.hasEmail) score += 30;
  if (input.hasContactForm) score += 25;
  if (input.hasPhone) score += 20;
  if (input.hasFacebook) score += 15;
  if (input.hasInstagram) score += 10;
  if (input.hasWhatsApp) score += 20;
  return Math.min(100, score);
}

export function isContactable(input: {
  hasEmail: boolean;
  hasContactForm: boolean;
  hasFacebook: boolean;
  hasWhatsApp: boolean;
  hasPhone: boolean;
}): boolean {
  return (
    input.hasEmail ||
    input.hasContactForm ||
    input.hasFacebook ||
    input.hasWhatsApp ||
    input.hasPhone
  );
}
