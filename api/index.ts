import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createReviewApp } from "../src/server/createApp.js";

let appPromise: ReturnType<typeof createReviewApp> | null = null;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!appPromise) {
    appPromise = createReviewApp({ serveStatic: false });
  }
  const app = await appPromise;
  app(req, res);
}
