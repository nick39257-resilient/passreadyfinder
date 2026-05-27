const BLOCKED_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "mailer-daemon",
  "wordpress",
  "example",
  "sentry",
  "wix",
  "schema",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
]);

function normalizeWebsiteUrl(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function websiteHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function extractEmailsFromText(text: string): string[] {
  const fromMailto = [...text.matchAll(/mailto:([^\s"'?<>]+)/gi)].map((m) =>
    decodeURIComponent(m[1] ?? "").trim(),
  );
  const fromBody = [...text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)].map(
    (m) => m[0].trim(),
  );
  return [...fromMailto, ...fromBody];
}

export function pickBusinessEmail(
  candidates: string[],
  websiteUrl: string | null,
): string | null {
  const host = websiteUrl ? websiteHost(websiteUrl) : null;
  const unique = [
    ...new Set(
      candidates
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ].filter((email) => {
    const local = email.split("@")[0] ?? "";
    if (BLOCKED_LOCAL_PARTS.has(local)) {
      return false;
    }
    if (email.includes("example.com") || email.includes("sentry.io")) {
      return false;
    }
    return true;
  });

  if (unique.length === 0) {
    return null;
  }

  if (host) {
    const onDomain = unique.find((email) => {
      const domain = email.split("@")[1] ?? "";
      return domain === host || domain.endsWith(`.${host}`);
    });
    if (onDomain) {
      return onDomain;
    }
  }

  const preferredPrefixes = ["info@", "hello@", "contact@", "enquiries@", "orders@", "order@"];
  for (const prefix of preferredPrefixes) {
    const hit = unique.find((email) => email.startsWith(prefix));
    if (hit) {
      return hit;
    }
  }

  return unique[0] ?? null;
}

/** Fetch a business homepage and extract the best contact email. */
export async function fetchEmailFromWebsite(website: string): Promise<string | null> {
  const url = normalizeWebsiteUrl(website);
  if (!url) {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "passreadyfinder/1.0 (contact enrichment)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const emails = extractEmailsFromText(html);
    return pickBusinessEmail(emails, url);
  } catch {
    return null;
  }
}
