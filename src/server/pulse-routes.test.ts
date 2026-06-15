/**
 * Smoke test for Pulse + marketing traffic endpoints.
 * Run: npm run test:pulse
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./createApp.js";

let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failed++;
  } else {
    console.log(`✓ ${message}`);
  }
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = text;
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const app = await createApp({ serveStatic: false });
const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as AddressInfo).port;

const dashboard = await request(port, "GET", "/api/pulse/dashboard");
assert(dashboard.status === 200, "GET /api/pulse/dashboard returns 200");
assert(
  typeof dashboard.json === "object" &&
    dashboard.json !== null &&
    "traffic" in dashboard.json &&
    "trials" in dashboard.json,
  "pulse dashboard returns aggregated snapshot",
);

const pixel = await request(port, "GET", "/api/marketing-traffic/pixel.gif?source=web&site=uk");
assert(pixel.status === 200, "GET /api/marketing-traffic/pixel.gif returns 200");

const trial = await request(port, "POST", "/api/pulse/trial-signup", {
  businessName: "Pulse Test Cafe",
});
assert(
  trial.status === 401 || trial.status === 200,
  "POST /api/pulse/trial-signup responds (401 without webhook secret, 200 when configured)",
);

server.close();

if (failed > 0) {
  process.exit(1);
}
console.log("\nAll pulse route tests passed.");
