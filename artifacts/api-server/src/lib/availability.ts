import { promises as dnsPromises } from "dns";
import { logger } from "./logger";

export type AvailabilitySignal = "available" | "registered" | "unknown";

export interface DnsCheckResult {
  fqdn: string;
  signal: AvailabilitySignal;
  evidence: string;
  checkedAt: string;
}

const DNS_TIMEOUT_MS = 4500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const e = new Error("dns_timeout") as NodeJS.ErrnoException;
      e.code = "ETIMEOUT";
      reject(e);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function dnsAvailability(fqdn: string): Promise<DnsCheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    const ns = await withTimeout(dnsPromises.resolveNs(fqdn), DNS_TIMEOUT_MS);
    if (Array.isArray(ns) && ns.length > 0) {
      return {
        fqdn,
        signal: "registered",
        evidence: `NS: ${ns.slice(0, 2).join(", ")}`,
        checkedAt,
      };
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code ?? "";
    if (code === "ENOTFOUND") {
      return {
        fqdn,
        signal: "available",
        evidence: "NXDOMAIN (no NS, no SOA)",
        checkedAt,
      };
    }
    if (code === "ENODATA") {
      try {
        const soa = await withTimeout(
          dnsPromises.resolveSoa(fqdn),
          DNS_TIMEOUT_MS,
        );
        if (soa && soa.nsname) {
          return {
            fqdn,
            signal: "registered",
            evidence: `SOA: ${soa.nsname}`,
            checkedAt,
          };
        }
      } catch (err2: unknown) {
        const c2 = (err2 as NodeJS.ErrnoException)?.code ?? "";
        if (c2 === "ENOTFOUND" || c2 === "ENODATA") {
          return {
            fqdn,
            signal: "available",
            evidence: "no NS, no SOA",
            checkedAt,
          };
        }
      }
      return { fqdn, signal: "unknown", evidence: "ENODATA", checkedAt };
    }
    if (code === "ETIMEOUT" || code === "ESERVFAIL" || code === "EREFUSED") {
      return { fqdn, signal: "unknown", evidence: code, checkedAt };
    }
    logger.debug({ fqdn, err }, "dns lookup error");
  }

  // Final fallback: try A lookup. If it resolves → registered. If NXDOMAIN → available.
  try {
    const a = await withTimeout(dnsPromises.resolve4(fqdn), DNS_TIMEOUT_MS);
    if (Array.isArray(a) && a.length > 0) {
      return { fqdn, signal: "registered", evidence: `A: ${a[0]}`, checkedAt };
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code ?? "";
    if (code === "ENOTFOUND") {
      return { fqdn, signal: "available", evidence: "NXDOMAIN (A)", checkedAt };
    }
  }

  return { fqdn, signal: "unknown", evidence: "no records", checkedAt };
}

export async function dnsAvailabilityBatch(
  fqdns: string[],
  concurrency = 64,
): Promise<DnsCheckResult[]> {
  const out: DnsCheckResult[] = new Array(fqdns.length);
  const workerCount = Math.min(concurrency, fqdns.length);
  async function worker(workerStart: number) {
    for (let idx = workerStart; idx < fqdns.length; idx += workerCount) {
      const fqdn = fqdns[idx]!;
      try {
        out[idx] = await dnsAvailability(fqdn);
      } catch {
        out[idx] = {
          fqdn,
          signal: "unknown",
          evidence: "worker_error",
          checkedAt: new Date().toISOString(),
        };
      }
    }
  }
  await Promise.all(
    Array.from({ length: workerCount }, (_, workerStart) => worker(workerStart)),
  );
  return out;
}

export { dnsPromises };
