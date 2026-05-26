import { productConfig } from "../../config/product.config.js";
import {
  fsaApiQueue,
  HttpRateLimitError,
  parseRetryAfterMs,
} from "../rate-limit-queue.js";

export const FSA_HEADERS = {
  "x-api-version": "2",
  Accept: "application/json",
};

export function fsaUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, productConfig.fsa.baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fsaFetchOnce<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const response = await fetch(fsaUrl(path, params), { headers: FSA_HEADERS });
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
    const body = await response.text();
    throw new HttpRateLimitError(
      429,
      `FSA API rate limited for ${path}: ${body.slice(0, 200)}`,
      retryAfterMs,
    );
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FSA API error ${response.status} for ${path}: ${body}`);
  }
  const json: unknown = await response.json();
  return json as T;
}

/** Throttled FSA GET with 429 retry — all FSA traffic goes through one queue. */
export function fsaFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  return fsaApiQueue.run(() => fsaFetchOnce<T>(path, params));
}

/** Throttled raw URL fetch (e.g. /Establishments/{id}). */
export function fsaFetchUrl(url: string): Promise<Response> {
  return fsaApiQueue.run(async () => {
    const response = await fetch(url, { headers: FSA_HEADERS });
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      const body = await response.text();
      throw new HttpRateLimitError(
        429,
        `FSA API rate limited: ${body.slice(0, 200)}`,
        retryAfterMs,
      );
    }
    return response;
  });
}
