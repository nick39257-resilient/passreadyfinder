import { texasProductConfig } from "../../config/product.texas.config.js";
import {
  applySpintaxTemplate,
  buildSpintaxLeadContext,
  type SpintaxLeadContext,
} from "../spintax.js";

export const TEXAS_URGENT_SUBJECT_SPINTAX =
  "{Important|Action Required|Update}: DSHS July 1st Transition - {{businessName}} permits";

export type TexasVendorCategory = "TYPE_I" | "TYPE_II_III";

/** Default to Type II/III (full prep) when tier is missing or ambiguous. */
export function normalizeTexasVendorCategory(
  vendorTier: string | null | undefined,
): TexasVendorCategory {
  if (vendorTier?.trim().toUpperCase() === "TYPE_I") {
    return "TYPE_I";
  }
  return "TYPE_II_III";
}

export interface TexasHb2844SpintaxContext extends SpintaxLeadContext {
  scoreUrl: string;
  siteUrl: string;
}

export function buildTexasHb2844SpintaxContext(input: {
  business_name: string;
  owner_name?: string | null;
  local_authority_name?: string | null;
  address?: string | null;
  postcode?: string | null;
  city?: string | null;
  scoreUrl: string;
  siteUrl?: string;
}): TexasHb2844SpintaxContext {
  const base = buildSpintaxLeadContext({
    business_name: input.business_name,
    owner_name: input.owner_name,
    local_authority_name: input.local_authority_name ?? input.city,
    address: input.address?.trim() || input.city?.trim() || input.business_name,
    postcode: input.postcode,
  });

  return {
    ...base,
    scoreUrl: input.scoreUrl,
    siteUrl: input.siteUrl ?? texasProductConfig.outreach.siteUrl,
  };
}

function applyTexasHb2844Template(
  template: string,
  context: TexasHb2844SpintaxContext,
): string {
  const withUrls = template
    .replace(/\{\{scoreUrl\}\}/gi, context.scoreUrl)
    .replace(/\{\{siteUrl\}\}/gi, context.siteUrl);

  return applySpintaxTemplate(withUrls, context);
}

export function resolveTexasHb2844Subject(
  context: TexasHb2844SpintaxContext,
  customTemplate?: string | null,
): string {
  const template = customTemplate?.trim() || TEXAS_URGENT_SUBJECT_SPINTAX;
  return applyTexasHb2844Template(template, context);
}

const TYPE_II_III_BODY_SPINTAX = `{Hi|Hello|Hey} {{managerName}},

{Texas DSHS is|DSHS is} rolling out {new statewide|unified statewide} requirements on July 1, 2026 under HB 2844. For {full-prep|on-site cooking} mobile units like {{businessName}}, inspectors will expect {digital temperature logs|complete temperature chains} and {allergen matrices|allergen documentation} ready for review — not scattered paperwork.

PassReady {automates|handles} this exact {compliance stack|paperwork} so your team is organized before the new state inspector workflow hits.

Free DSHS readiness check for {{businessName}}:
{{scoreUrl}}

Learn more: {{siteUrl}}

— PassReady US mobile module`;

const TYPE_I_BODY_SPINTAX = `{Hi|Hello|Hey} {{managerName}},

{Quick heads-up|Just a note} on the July 1, 2026 DSHS transition for {{businessName}}: HB 2844 moves {basic licensing|licensing} and {document storage|permit records} into the {new unified|statewide} DSHS dashboard.

PassReady keeps your {prepackaged|low-prep} operation's {documents|permits} in one place so you're not hunting files when DSHS goes live.

Free readiness check:
{{scoreUrl}}

Learn more: {{siteUrl}}

— PassReady US mobile module`;

export function resolveTexasHb2844Body(
  context: TexasHb2844SpintaxContext,
  vendorTier: string | null | undefined,
): string {
  const category = normalizeTexasVendorCategory(vendorTier);
  const template =
    category === "TYPE_I" ? TYPE_I_BODY_SPINTAX : TYPE_II_III_BODY_SPINTAX;
  return applyTexasHb2844Template(template, context);
}
