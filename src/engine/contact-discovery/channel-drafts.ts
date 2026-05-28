import { productConfig } from "../../config/product.config.js";
import type { ContactDiscoveryResult } from "./types.js";
import type { ChannelDrafts } from "./types.js";
import { getLowestScoreArea, type FsaBreakdownScores } from "../intelligence/carrot.js";

export function buildChannelDrafts(input: {
  businessName: string;
  discovery: ContactDiscoveryResult;
  fsaScores: FsaBreakdownScores;
  fsaRating: number | null;
}): ChannelDrafts {
  const product = productConfig.outreach.productName;
  const focus = getLowestScoreArea(input.fsaScores);
  const focusLine =
    focus === "management"
      ? "keeping checklists and handovers organised before the next inspection"
      : focus === "hygiene"
        ? "day-to-day hygiene habits when service is flat-out"
        : focus === "structural"
          ? "small structural upkeep wins between services"
          : "staying inspection-ready without extra paperwork stress";

  const opener = `Hi — I'm a kitchen manager in Preston (30 years in takeaways). I built ${product} for my own team and wondered if it might help ${input.businessName} with ${focusLine}.`;

  const email =
    input.discovery.email.value
      ? `${opener}\n\nIt's checklists and allergen support in English, Urdu, Bengali and Polish — nothing flashy, just what helped us pass inspections with less stress.\n\nIf you'd like a 7-day trial, just reply YES and I'll send the link.\n\nThanks`
      : null;

  const contactForm = input.discovery.contactFormDetected
    ? `${opener} PassReady covers EHO-style checklists, allergen matrix help, and multilingual support for busy kitchens. Happy to share a 7-day trial if useful — reply here or ask for details.`
    : null;

  const facebook = input.discovery.facebook.value
    ? `${opener} PassReady is a side project for inspection readiness (allergens, multilingual checklists, paperwork). Message me if you'd like a quick look — no pressure.`
    : null;

  const whatsapp = input.discovery.whatsapp.value
    ? `${opener} PassReady helped our kitchen stay on top of inspections. Want a 7-day trial? Just say yes.`
    : null;

  const phoneScript = input.discovery.phone.value
    ? `Hi, is this ${input.businessName}? I'm Nick — kitchen manager in Preston. Quick one: we use PassReady for inspection checklists and allergen paperwork (${productConfig.outreach.monthlyPrice}/mo after trial). Would the owner have two minutes for a friendly trial, or is there a better number?`
    : null;

  void input.fsaRating;
  return { email, contactForm, facebook, whatsapp, phoneScript };
}
