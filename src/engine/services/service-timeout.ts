/** Shared timeout helpers for Phase 1 enrichment (Apollo, Playwright). */

export class OperationTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

export function remainingMs(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

export async function withTimeout<T>(
  timeoutMs: number,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new OperationTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function closeBrowserSafe(
  browser: { close: () => Promise<void> } | null | undefined,
): Promise<void> {
  if (!browser) {
    return;
  }
  try {
    await browser.close();
  } catch {
    /* ignore close errors */
  }
}
