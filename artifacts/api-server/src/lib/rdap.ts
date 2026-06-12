import { logger } from "./logger";

export type RdapVerdict = "available" | "registered" | "unknown";

export interface RdapResult {
  fqdn: string;
  verdict: RdapVerdict;
  evidence: string;
  registrationDate?: string;
  expirationDate?: string;
  status?: string[];
}

const VERISIGN_RDAP = "https://rdap.verisign.com/com/v1/domain/";
const RDAP_TIMEOUT_MS = 8000;

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapResponse {
  events?: RdapEvent[];
  status?: string[];
}

export async function rdapDotComCheck(fqdn: string): Promise<RdapResult> {
  const lower = fqdn.toLowerCase();
  if (!lower.endsWith(".com")) {
    return { fqdn, verdict: "unknown", evidence: "rdap-skip-non-com" };
  }
  let res: Response;
  try {
    res = await fetch(VERISIGN_RDAP + encodeURIComponent(lower), {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const name = (err as Error)?.name ?? "fetch_err";
    return { fqdn, verdict: "unknown", evidence: `RDAP: ${name}` };
  }

  if (res.status === 404) {
    return { fqdn, verdict: "available", evidence: "RDAP: 404 not-found" };
  }
  if (res.status === 429) {
    return { fqdn, verdict: "unknown", evidence: "RDAP: 429 rate-limit" };
  }
  if (res.status >= 500) {
    return { fqdn, verdict: "unknown", evidence: `RDAP: HTTP ${res.status}` };
  }
  if (res.status === 200) {
    let body: RdapResponse;
    try {
      body = (await res.json()) as RdapResponse;
    } catch {
      return { fqdn, verdict: "unknown", evidence: "RDAP: parse-error" };
    }
    const reg = body.events?.find((e) => e.eventAction === "registration");
    const exp = body.events?.find(
      (e) => e.eventAction === "expiration",
    );
    const status = body.status ?? [];
    const date = reg?.eventDate?.slice(0, 10) ?? "?";
    const tag = status.slice(0, 2).join(",");
    return {
      fqdn,
      verdict: "registered",
      evidence: `RDAP: registered ${date}${tag ? ` [${tag}]` : ""}`,
      registrationDate: reg?.eventDate,
      expirationDate: exp?.eventDate,
      status,
    };
  }
  return { fqdn, verdict: "unknown", evidence: `RDAP: HTTP ${res.status}` };
}

export async function rdapBatch(
  fqdns: string[],
  concurrency = 8,
  delayMsBetween = 0,
): Promise<RdapResult[]> {
  const out: RdapResult[] = new Array(fqdns.length);
  const workerCount = Math.min(concurrency, fqdns.length);
  async function worker(workerStart: number) {
    for (let idx = workerStart; idx < fqdns.length; idx += workerCount) {
      const fqdn = fqdns[idx]!;
      try {
        out[idx] = await rdapDotComCheck(fqdn);
      } catch (err) {
        logger.debug({ fqdn, err }, "RDAP worker error");
        out[idx] = { fqdn, verdict: "unknown", evidence: "RDAP: worker-error" };
      }
      if (delayMsBetween > 0)
        await new Promise((r) => setTimeout(r, delayMsBetween));
    }
  }
  await Promise.all(
    Array.from({ length: workerCount }, (_, workerStart) => worker(workerStart)),
  );
  return out;
}
