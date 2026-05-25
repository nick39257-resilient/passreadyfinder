import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = path.join(root, "dashboard/dist/index.html");

if (fs.existsSync(index)) {
  process.exit(0);
}

console.log("Dashboard dist missing — installing dashboard deps and building…");
execSync("npm install --prefix dashboard", { cwd: root, stdio: "inherit" });
execSync("npm run build --prefix dashboard", { cwd: root, stdio: "inherit" });

if (!fs.existsSync(index)) {
  console.error("Dashboard build finished but index.html is still missing.");
  process.exit(1);
}

console.log("Dashboard build complete.");
