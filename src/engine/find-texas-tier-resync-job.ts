import { logEngineError } from "./intelligence/system-status.js";
import { runTexasTierResyncPipeline } from "./texas/texas-pipeline.js";

export async function runTexasTierResyncJob() {
  console.log("TexasTierResync: HB 2844 vendor tiers + mobile outreach drafts\n");
  try {
    return await runTexasTierResyncPipeline();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEngineError("find_texas", "Texas tier resync failed", message);
    throw err;
  }
}
