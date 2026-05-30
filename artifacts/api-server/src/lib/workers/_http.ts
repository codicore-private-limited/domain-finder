import { logger } from "../logger";

/** Resilient JSON fetch — returns null on any failure. Workers must never throw on a network blip. */
export async function safeJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent":
          "domain-finder-codicore/1.0 (+https://github.com/rishi9520/domain-finder)",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, "worker http non-OK");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.debug({ url, err }, "worker http failed");
    return null;
  }
}

export async function safeText(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent":
          "domain-finder-codicore/1.0 (+https://github.com/rishi9520/domain-finder)",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
