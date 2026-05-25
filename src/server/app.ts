import "dotenv/config";
import { closeDb } from "../engine/store/db.js";
import { createApp } from "./createApp.js";

const PORT = Number(process.env.PORT ?? process.env.REVIEW_PORT ?? 3000);

async function start(): Promise<void> {
  const app = await createApp({ serveStatic: true });
  app.listen(PORT, "0.0.0.0", () => {
    const host = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${PORT}`;
    console.log(`PassReady control panel → ${host}/`);
    console.log(`Review drafts → ${host}/review`);
    console.log(`React dashboard → ${host}/dashboard/`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDb();
  process.exit(0);
});
