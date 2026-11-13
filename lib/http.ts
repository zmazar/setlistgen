import { unstable_rethrow } from "next/navigation";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  // Spotify API: { error: { status, message } }; Deezer: { error: { type, message } }
  if (b.error && typeof b.error === "object") {
    const msg = (b.error as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  // Spotify accounts: { error: "invalid_grant", error_description }
  if (typeof b.error_description === "string") return b.error_description;
  if (typeof b.error === "string") return b.error;
  // setlist.fm: { code, status, message }
  if (typeof b.message === "string") return b.message;
  return undefined;
}

/**
 * fetch + JSON parse, throwing HttpError on non-2xx. Retries 429s honoring Retry-After.
 */
export async function fetchJson<T>(url: string, init?: RequestInit, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after")) || 1;
      await sleep(Math.min(retryAfter, 10) * 1000 + 250);
      continue;
    }
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    if (!res.ok) {
      throw new HttpError(res.status, extractMessage(body) ?? `${res.status} ${res.statusText}`);
    }
    if (body === undefined && text) {
      throw new HttpError(502, `Unexpected non-JSON response from ${new URL(url).host}`);
    }
    return body as T;
  }
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Turn an error into a JSON response. Re-throws Next.js control-flow errors (prerender bailout, redirect, notFound). */
export function errorResponse(error: unknown): Response {
  unstable_rethrow(error);
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  // Log a string, not the Error object: Next's dev code-frame renderer crashes under the
  // WASM SWC bindings this machine falls back to, which drops the response.
  console.error(`[setlistgen] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  const message = error instanceof Error ? error.message : "Internal error";
  return Response.json({ error: message }, { status: 500 });
}
