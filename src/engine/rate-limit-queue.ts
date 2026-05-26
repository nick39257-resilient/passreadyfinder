import OpenAI from "openai";
import { productConfig } from "../config/product.config.js";

export class HttpRateLimitError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "HttpRateLimitError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header?.trim()) {
    return null;
  }
  const trimmed = header.trim();
  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

/** True for HTTP 429, OpenAI 429, or common rate-limit error text. */
export function isRateLimited(err: unknown): boolean {
  if (err instanceof HttpRateLimitError) {
    return err.status === 429;
  }
  if (err instanceof OpenAI.APIError && err.status === 429) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /429|too many requests|rate limit|resource exhausted/i.test(message);
}

export function rateLimitPauseMs(err: unknown, basePauseMs: number): number {
  if (err instanceof HttpRateLimitError && err.retryAfterMs !== null) {
    return Math.max(basePauseMs, err.retryAfterMs);
  }
  if (err instanceof OpenAI.APIError && err.status === 429) {
    return basePauseMs;
  }
  return basePauseMs;
}

/** Exponential backoff pause: baseMs × 2^(attempt - 1). */
export function exponentialBackoffPauseMs(baseMs: number, attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return baseMs * 2 ** exponent;
}

export function randomBetweenMs(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) {
    return minMs;
  }
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

/**
 * Run fn with retries on rate-limit errors. Each retry waits longer (exponential backoff).
 * Non-rate-limit errors throw immediately.
 */
export async function executeWithExponentialBackoff<T>(
  label: string,
  fn: () => Promise<T>,
  options: {
    basePauseMs: number;
    maxRetries: number;
    isRetryable?: (err: unknown) => boolean;
  },
): Promise<T> {
  const isRetryable = options.isRetryable ?? isRateLimited;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (!isRetryable(err) || attempt > options.maxRetries) {
        throw err;
      }
      const pauseMs = Math.max(
        exponentialBackoffPauseMs(options.basePauseMs, attempt),
        rateLimitPauseMs(err, options.basePauseMs),
      );
      console.warn(
        `[${label}] Rate limited (429) — pausing ${Math.round(pauseMs / 1000)}s before retry ${attempt}/${options.maxRetries}`,
      );
      await sleep(pauseMs);
    }
  }
}

type QueueTask<T> = () => Promise<T>;

/**
 * Serial queue with minimum spacing between calls and automatic 429 backoff.
 */
export class RateLimitQueue {
  private tail: Promise<void> = Promise.resolve();
  private lastFinishedAt = 0;

  constructor(
    private readonly name: string,
    private readonly minIntervalMs: number,
    private readonly rateLimitPauseMs: number,
    private readonly maxRetries: number,
  ) {}

  /** Enqueue work — one in-flight at a time per queue, with throttle + retry. */
  run<T>(fn: QueueTask<T>): Promise<T> {
    const execute = async (): Promise<T> => {
      await this.waitForSlot();
      return this.executeWithRetry(fn);
    };

    const result = execute();
    this.tail = result.then(
      () => {
        this.lastFinishedAt = Date.now();
      },
      () => {
        this.lastFinishedAt = Date.now();
      },
    );
    return result;
  }

  private async waitForSlot(): Promise<void> {
    await this.tail;
    const elapsed = Date.now() - this.lastFinishedAt;
    const waitMs = this.minIntervalMs - elapsed;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private async executeWithRetry<T>(fn: QueueTask<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (!isRateLimited(err) || attempt > this.maxRetries) {
          throw err;
        }
        const pauseMs = rateLimitPauseMs(err, this.rateLimitPauseMs) * attempt;
        console.warn(
          `[${this.name}] Rate limited — pausing ${Math.round(pauseMs / 1000)}s before retry ${attempt}/${this.maxRetries}`,
        );
        await sleep(pauseMs);
      }
    }
  }
}

export const fsaApiQueue = new RateLimitQueue(
  "FSA",
  productConfig.fsa.requestDelayMs,
  productConfig.fsa.rateLimitPauseMs,
  productConfig.fsa.maxRetries,
);

export const geminiApiQueue = new RateLimitQueue(
  "Gemini",
  productConfig.outreach.geminiRequestDelayMs,
  productConfig.outreach.geminiRateLimitPauseMs,
  productConfig.outreach.geminiMaxRetries,
);
