import { extractStreetName } from "./drafter.js";
import { resolveDraftLocalAuthorityName } from "./drafter.js";

/** Resolve `{option A|option B}` blocks to a random choice. */
export function parseSpintax(text: string): string {
  return text.replace(/{([^{}]+)}/g, (_match, options: string) => {
    const choices = options.split("|");
    return choices[Math.floor(Math.random() * choices.length)] ?? options;
  });
}

export interface SpintaxLeadContext {
  businessName: string;
  managerName: string;
  localAuthority: string;
  town: string;
  street: string;
}

export function buildSpintaxLeadContext(input: {
  business_name: string;
  owner_name?: string | null;
  local_authority_name?: string | null;
  address: string;
  postcode?: string | null;
}): SpintaxLeadContext {
  const businessName = input.business_name.trim() || "your kitchen";
  const owner = input.owner_name?.trim();
  const postcodeTown = input.postcode?.trim().split(/\s+/)[0] ?? "";
  const street = extractStreetName(input.address);

  return {
    businessName,
    managerName: owner || "there",
    localAuthority: resolveDraftLocalAuthorityName(input.local_authority_name),
    town: postcodeTown || street || "your area",
    street,
  };
}

/** Replace `{{field}}` tokens, then resolve spintax blocks. */
export function applySpintaxTemplate(
  template: string,
  context: SpintaxLeadContext,
): string {
  const withFields = template
    .replace(/\{\{businessName\}\}/gi, context.businessName)
    .replace(/\{\{managerName\}\}/gi, context.managerName)
    .replace(/\{\{localAuthority\}\}/gi, context.localAuthority)
    .replace(/\{\{town\}\}/gi, context.town)
    .replace(/\{\{street\}\}/gi, context.street);

  return parseSpintax(withFields).replace(/\s{2,}/g, " ").trim();
}

const FIRST_TOUCH_SUBJECT_TEMPLATES = [
  "{Hi|Hello|Good morning} — {quick question|a quick one} about {kitchen records|compliance logs} at {{businessName}}",
  "{Hey|Hi} {{managerName}} — {{localAuthority}} {takeaway|kitchen} question re {{businessName}}",
  "{Quick one|Question} about {{businessName}} on {{street}}",
] as const;

const FOLLOW_UP_SUBJECT_TEMPLATES = [
  "{Following up|Quick follow-up} on {{businessName}} in {{town}}",
  "{Hi|Hey} {{managerName}} — {score check|free check} for {{businessName}}?",
  "{{businessName}} — {still useful?|worth a look?}",
] as const;

export function resolveSpintaxSubject(
  context: SpintaxLeadContext,
  touchCount: number,
  customTemplate?: string | null,
): string {
  if (customTemplate?.trim()) {
    return applySpintaxTemplate(customTemplate.trim(), context);
  }

  const templates = touchCount >= 1 ? FOLLOW_UP_SUBJECT_TEMPLATES : FIRST_TOUCH_SUBJECT_TEMPLATES;
  const template = templates[Math.floor(Math.random() * templates.length)] ?? templates[0];
  return applySpintaxTemplate(template, context);
}

/** Light spintax on sign-off lines only — keeps Gemini draft body intact. */
export function applyBodySpintax(body: string, context: SpintaxLeadContext): string {
  const opener = applySpintaxTemplate(
    "{Hi|Hello|Hey} {{managerName}},",
    context,
  );
  const trimmed = body.trim();
  if (/^(hi|hello|hey)\b/i.test(trimmed)) {
    return trimmed;
  }
  return `${opener}\n\n${trimmed}`;
}
