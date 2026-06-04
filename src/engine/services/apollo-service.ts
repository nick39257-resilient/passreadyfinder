import { productConfig } from "../../config/product.config.js";
import { getSetting, setSetting } from "../store/outreach-migrations.js";
import { withTimeout } from "./service-timeout.js";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

/** Per HTTP request to Apollo. */
export const APOLLO_HTTP_TIMEOUT_MS = 15_000;

/** Whole owner lookup (search + optional match) — abort so find jobs cannot hang. */
export const APOLLO_LEAD_LOOKUP_TIMEOUT_MS = 30_000;

const OWNER_TITLE_KEYWORDS = [
  "owner",
  "proprietor",
  "director",
  "partner",
  "operations",
  "managing",
  "founder",
  "ceo",
  "general manager",
] as const;

export type ApolloOwnerMatch = {
  email: string;
  ownerName: string | null;
  title: string | null;
  source: "mixed_people/search" | "people/match";
};

function apolloApiKey(): string | null {
  return process.env.APOLLO_API_KEY?.trim() || null;
}

function extractCity(address: string, postcode: string): string {
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (!/^\d/.test(last) && last.length > 2) {
      return last;
    }
  }
  return postcode.trim().split(/\s+/)[0] ?? "";
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

function titleMatchesOwner(title: string | null | undefined): boolean {
  const lower = title?.trim().toLowerCase() ?? "";
  if (!lower) {
    return false;
  }
  return OWNER_TITLE_KEYWORDS.some((k) => lower.includes(k));
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

export async function canCallApolloToday(): Promise<boolean> {
  if (!isApolloConfigured()) {
    return false;
  }
  const used = await getApolloCreditsUsedToday();
  return used < productConfig.enrichment.apolloDailyCap;
}

async function findOwnerEmailViaApolloInner(input: {
  businessName: string;
  address: string;
  postcode: string;
  website?: string | null;
}): Promise<ApolloOwnerMatch | null> {
  if (!(await canCallApolloToday())) {
    return null;
  }

  const city = extractCity(input.address, input.postcode);
  const domain = domainFromWebsite(input.website);

  const searchBody: Record<string, unknown> = {
    page: 1,
    per_page: 8,
    q_organization_name: input.businessName,
    person_titles: [
      "Owner",
      "Proprietor",
      "Director",
      "Managing Director",
      "Partner",
      "Operations Manager",
    ],
  };
  if (domain) {
    searchBody.q_organization_domains_list = [domain];
  }
  if (city) {
    searchBody.organization_locations = [city];
  }

  await incrementApolloCredits();
  const search = await apolloFetch<{ people?: Record<string, unknown>[] }>(
    "/mixed_people/search",
    searchBody,
  );
  const people = search?.people ?? [];

  for (const person of people) {
    const title = typeof person.title === "string" ? person.title : null;
    if (!titleMatchesOwner(title)) {
      continue;
    }
    const email = pickEmail(person);
    if (!email) {
      continue;
    }
    return {
      email,
      ownerName: personDisplayName(person),
      title,
      source: "mixed_people/search",
    };
  }

  const fallback = people.find((p) => pickEmail(p));
  if (fallback) {
    const email = pickEmail(fallback);
    if (email) {
      return {
        email,
        ownerName: personDisplayName(fallback),
        title: typeof fallback.title === "string" ? fallback.title : null,
        source: "mixed_people/search",
      };
    }
  }

  if (domain && (await canCallApolloToday())) {
    await incrementApolloCredits();
    const match = await apolloFetch<{ person?: Record<string, unknown> }>("/people/match", {
      organization_name: input.businessName,
      domain,
      reveal_personal_emails: false,
    });
    const person = match?.person;
    if (person) {
      const email = pickEmail(person);
      if (email) {
        return {
          email,
          ownerName: personDisplayName(person),
          title: typeof person.title === "string" ? person.title : null,
          source: "people/match",
        };
      }
    }
  }

  return null;
}

/** Find owner/decision-maker email via Apollo (mixed search + optional people/match). Never hangs indefinitely. */
export async function findOwnerEmailViaApollo(input: {
  businessName: string;
  address: string;
  postcode: string;
  website?: string | null;
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
