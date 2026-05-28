const USER_AGENT = "passreadyfinder/1.0 (contact discovery; admin-only)";

export function contactDiscoveryUserAgent(): string {
  return USER_AGENT;
}

/** Best-effort robots.txt check — if root is disallowed for *, skip scraping. */
export async function isRootDisallowedByRobots(siteOrigin: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(siteOrigin).origin;
  } catch {
    return false;
  }

  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return false;
    }
    const text = await res.text();
    return parseRobotsDisallowsRoot(text);
  } catch {
    return false;
  }
}

function parseRobotsDisallowsRoot(robotsTxt: string): boolean {
  let appliesToUs = false;
  for (const line of robotsTxt.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      const agent = lower.slice("user-agent:".length).trim();
      appliesToUs = agent === "*" || agent.includes("passready");
      continue;
    }
    if (appliesToUs && lower.startsWith("disallow:")) {
      const path = trimmed.slice("disallow:".length).trim();
      if (path === "/" || path === "/*") {
        return true;
      }
    }
  }
  return false;
}
