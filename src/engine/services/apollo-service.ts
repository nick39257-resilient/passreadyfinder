import { productConfig } from "../../config/product.config.js";
import { getSetting, setSetting } from "../store/outreach-migrations.js";
import { withTimeout } from "./service-timeout.js";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

/** Per HTTP request to Apollo. */
export const APOLLO_HTTP_TIMEOUT_MS = 15_000;

/** Whole owner lookup (people/match only on free plan) — abort so find jobs cannot hang. */
export const APOLLO_LEAD_LOOKUP_TIMEOUT_MS = 30_000;

export type ApolloOwnerMatch = {
  email: string;
  ownerName: string | null;
  title: string | null;
  source: "people/match";
};

export type ApolloPersonNameParts = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
};

export function parsePersonName(
  fullName: string | null | undefined,
): ApolloPersonNameParts {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return { firstName: null, lastName: null, fullName: null };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null, fullName: trimmed };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: trimmed,
  };
}

function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website?.trim()) {
    return null;
  }
  try {
    const url = /^https?:\/\//i.test(website.trim())
      ? website.trim()
      : `https://${website.trim()}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function pickEmail(person: Record<string, unknown>): string | null {
  const direct = typeof person.email === "string" ? person.email : null;
  if (direct?.includes("@")) {
    return direct.trim().toLowerCase();
  }
  const emails = person.contact_emails;
  if (Array.isArray(emails)) {
    for (const entry of emails) {
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const email = typeof row.email === "string" ? row.email : null;
        if (email?.includes("@")) {
          return email.trim().toLowerCase();
        }
      }
    }
  }
  return null;
}

function personDisplayName(person: Record<string, unknown>): string | null {
  const first = typeof person.first_name === "string" ? person.first_name.trim() : "";
  const last = typeof person.last_name === "string" ? person.last_name.trim() : "";
  const full = `${first} ${last}`.trim();
  return full || (typeof person.name === "string" ? person.name.trim() : null);
}

function apolloApiKey(): string | null {
  return process.env.APOLLO_API_KEY?.trim() || null;
}

async function apolloFetch<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const key = apolloApiKey();
  if (!key) {
    return null;
  }

  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": key,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(APOLLO_HTTP_TIMEOUT_MS),
  });

  if (res.status === 429) {
    throw new Error("Apollo rate limit (429)");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${res.status}: ${text.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

async function getApolloCreditsUsedToday(): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `apollo_credits_${day}`;
  const raw = await getSetting(key);
  return raw ? Number(raw) || 0 : 0;
}

async function incrementApolloCredits(): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `apollo_credits_${day}`;
  const next = (await getApolloCreditsUsedToday()) + 1;
  await setSetting(key, String(next));
  return next;
}

export function isApolloConfigured(): boolean {
  return Boolean(apolloApiKey()) && productConfig.enrichment.apolloEnabled;
}

/** When apolloDailyCap is 0, API lookups are not capped (Texas batch scans full queue). */
export async function canCallApolloToday(): Promise<boolean> {
  if (!isApolloConfigured()) {
    return false;
  }
  const cap = productConfig.enrichment.apolloDailyCap;
  if (!cap || cap <= 0) {
    return true;
  }
  const used = await getApolloCreditsUsedToday();
  return used < cap;
}

function buildPeopleMatchAttempts(input: {
  businessName: string;
  website?: string | null;
  ownerName?: string | null;
}): Record<string, unknown>[] {
  const domain = domainFromWebsite(input.website);
  const org = input.businessName.trim();
  const { firstName, lastName, fullName } = parsePersonName(input.ownerName);
  const attempts: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const push = (body: Record<string, unknown>) => {
    const key = JSON.stringify(body);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    attempts.push(body);
  };

  const orgFields = {
    organization_name: org,
    reveal_personal_emails: false,
  };

  if (firstName && lastName) {
    push({
      first_name: firstName,
      last_name: lastName,
      ...orgFields,
      ...(domain ? { domain } : {}),
    });
  } else if (firstName) {
    push({
      first_name: firstName,
      ...orgFields,
      ...(domain ? { domain } : {}),
    });
    push({
      name: firstName,
      ...orgFields,
      ...(domain ? { domain } : {}),
    });
  } else if (fullName) {
    push({
      name: fullName,
      ...orgFields,
      ...(domain ? { domain } : {}),
    });
  }

  if (domain) {
    push({
      ...orgFields,
      domain,
    });
  }

  push({ ...orgFields });

  return attempts;
}

async function apolloPeopleMatch(
  body: Record<string, unknown>,
): Promise<ApolloOwnerMatch | null> {
  if (!(await canCallApolloToday())) {
    return null;
  }

  await incrementApolloCredits();
  const match = await apolloFetch<{ person?: Record<string, unknown> }>(
    "/people/match",
    body,
  );
  const person = match?.person;
  if (!person) {
    return null;
  }

  const email = pickEmail(person);
  if (!email) {
    return null;
  }

  return {
    email,
    ownerName: personDisplayName(person),
    title: typeof person.title === "string" ? person.title : null,
    source: "people/match",
  };
}

async function findOwnerEmailViaApolloInner(input: {
  businessName: string;
  address: string;
  postcode: string;
  website?: string | null;
  ownerName?: string | null;
}): Promise<ApolloOwnerMatch | null> {
  const attempts = buildPeopleMatchAttempts(input);

  for (const body of attempts) {
    const result = await apolloPeopleMatch(body);
    if (result) {
      return result;
    }
  }

  return null;
}

/** Find owner email via Apollo people/match (free-plan compatible; no mixed_people/search). */
export async function findOwnerEmailViaApollo(input: {
  businessName: string;
  address: string;
  postcode: string;
  website?: string | null;
  ownerName?: string | null;
}): Promise<ApolloOwnerMatch | null> {
  try {
    return await withTimeout(
      APOLLO_LEAD_LOOKUP_TIMEOUT_MS,
      "apollo_lead_lookup",
      () => findOwnerEmailViaApolloInner(input),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Apollo lookup aborted for ${input.businessName}: ${message}`);
    return null;
  }
}
