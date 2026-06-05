/**
 * Ensure Chromium exists at node_modules/playwright-core/.local-browsers/
 * (PLAYWRIGHT_BROWSERS_PATH=0). Render cron runs Linux — install at build/start, not from git.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browsersDir = join(root, "node_modules", "playwright-core", ".local-browsers");

function chromiumInstalledLocally() {
  if (!existsSync(browsersDir)) {
    return false;
  }
  try {
    return readdirSync(browsersDir, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() && entry.name.startsWith("chromium"),
    );
  } catch {
    return false;
  }
}

if (chromiumInstalledLocally()) {
  console.log(`[playwright] Chromium ready at ${browsersDir}`);
  process.exit(0);
}

console.log(`[playwright] Installing Chromium into ${browsersDir}…`);
execSync("npx playwright install chromium", {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "0",
  },
});
