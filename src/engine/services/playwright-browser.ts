import { closeBrowserSafe } from "./service-timeout.js";

type PlaywrightModule = typeof import("playwright");
type PlaywrightBrowser = Awaited<
  ReturnType<PlaywrightModule["chromium"]["launch"]>
>;

let sharedBrowser: PlaywrightBrowser | null = null;
let playwrightModule: PlaywrightModule | null = null;

async function loadPlaywright(): Promise<PlaywrightModule> {
  if (playwrightModule) {
    return playwrightModule;
  }
  try {
    playwrightModule = (await import("playwright")) as PlaywrightModule;
    return playwrightModule;
  } catch {
    throw new Error(
      "Playwright not installed — run: npm install playwright && npx playwright install chromium",
    );
  }
}

/** One headless Chromium per process — reuse across autopilot leads to save RAM on Render. */
export async function getSharedChromiumBrowser(): Promise<PlaywrightBrowser> {
  if (sharedBrowser?.isConnected()) {
    return sharedBrowser;
  }

  const { chromium } = await loadPlaywright();
  sharedBrowser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--js-flags=--max-old-space-size=128",
    ],
  });
  return sharedBrowser;
}

export async function closeSharedChromiumBrowser(): Promise<void> {
  await closeBrowserSafe(sharedBrowser);
  sharedBrowser = null;
}
