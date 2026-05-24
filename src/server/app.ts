import "dotenv/config";
import { closeDb } from "../engine/store/db.js";
import { createReviewApp } from "./createApp.js";

const PORT = Number(process.env.REVIEW_PORT ?? 3000);

async function start(): Promise<void> {
  const app = await createReviewApp({ serveStatic: true });
  app.listen(PORT, () => {
    const host = process.env.REVIEW_HOST ?? "localhost";
    console.log(`Review dashboard → http://${host}:${PORT}`);
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
