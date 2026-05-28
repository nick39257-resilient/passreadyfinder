import { runQueueDrafter } from "./queue-drafter.js";

export interface AutoDraftAllResult {
  drafted: number;
  batches: number;
  errors: number;
}

/**
 * Draft repeatedly until the eligible new-lead pool is empty.
 * Uses existing QueueDrafter pacing/backoff; no send.
 */
export async function runAutoDraftAll(onProgress?: (msg: string) => void | Promise<void>): Promise<AutoDraftAllResult> {
  let drafted = 0;
  let errors = 0;
  let batches = 0;

  for (;;) {
    batches++;
    await onProgress?.(`Auto-drafting batch ${batches}…`);
    const result = await runQueueDrafter({ batchSize: 25 });
    drafted += result.drafted;
    errors += result.errors.length;

    if (result.remainingNew <= 0) {
      break;
    }
    if (result.drafted === 0) {
      // Stop if pool exists but selection rules skip everything (risk threshold etc.)
      break;
    }
  }

  return { drafted, batches, errors };
}

