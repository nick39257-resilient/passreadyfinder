export interface AppConfig {
  requiresControlSecret: boolean;
  outreachLandingUrl?: string;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) {
    return { requiresControlSecret: false };
  }
  return res.json() as Promise<AppConfig>;
}
