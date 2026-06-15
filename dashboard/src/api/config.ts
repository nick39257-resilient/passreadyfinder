export interface AppConfig {
  requiresControlSecret: boolean;
  outreachLandingUrl?: string;
  copilotMode?: boolean;
  emailAutosend?: boolean;
  warmOnlyEmail?: boolean;
  marketsApi?: string;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) {
    return { requiresControlSecret: false };
  }
  return res.json() as Promise<AppConfig>;
}
