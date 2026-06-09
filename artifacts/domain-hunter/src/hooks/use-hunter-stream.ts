import { useEffect, useRef, useState } from "react";

export interface HunterEvent {
  id: number;
  ts: string;
  kind:
    | "phase"
    | "generated"
    | "scored"
    | "checking"
    | "registered"
    | "discovery"
    | "skipped"
    | "info"
    | "error";
  message: string;
  data?: Record<string, unknown>;
}

export interface PerBucketStats {
  generated: number;
  checked: number;
  diamonds: number;
}

export interface HunterState {
  running: boolean;
  startedAt: string | null;
  cycle: number;
  totalGenerated: number;
  totalEvaluated: number;
  totalScoreFiltered: number;
  totalChecked: number;
  totalRegistered: number;
  totalDiscoveries: number;
  totalUnknown: number;
  totalDuplicateSkips: number;
  totalRdapVerified: number;
  totalRdapFalsePositives: number;
  totalRdapUnknown: number;
  cleanupRunning: boolean;
  cleanupChecked: number;
  cleanupRemoved: number;
  currentCategory: string | null;
  currentStrategy: string | null;
  minValueScore: number;
  effectiveMinScore: number;
  starvationStreak: number;
  perStrategy: Record<string, PerBucketStats>;
  perCategory: Record<string, PerBucketStats>;
  everSearchedSize: number;
  recentNamesSize?: number;
  checksPerSecond: number;
  evaluatedPerSecond: number;
  batchSize: number;
  concurrency: number;
}

export interface HunterInsights {
  perStrategy: Array<PerBucketStats & { key: string; diamondYield: number }>;
  perCategory: Array<PerBucketStats & { key: string; diamondYield: number }>;
  recentNamesMemory: number;
  effectiveMinScore: number;
  requestedMinScore: number;
  starvationStreak: number;
}

const MAX_EVENTS = 250;

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export function useHunterStream(): {
  events: HunterEvent[];
  state: HunterState | null;
  connected: boolean;
} {
  const [events, setEvents] = useState<HunterEvent[]>([]);
  const [state, setState] = useState<HunterState | null>(null);
  const [connected, setConnected] = useState(false);
  const sinceIdRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryHandle: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      es = new EventSource(`${API_BASE}/hunter/stream?sinceId=${sinceIdRef.current}`);

      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        if (!cancelled) {
          retryHandle = setTimeout(connect, 2000);
        }
      };

      const eventKinds: HunterEvent["kind"][] = [
        "phase",
        "generated",
        "scored",
        "checking",
        "registered",
        "discovery",
        "skipped",
        "info",
        "error",
      ];

      for (const kind of eventKinds) {
        es.addEventListener(kind, (msg) => {
          try {
            const ev = JSON.parse((msg as MessageEvent).data) as HunterEvent;
            sinceIdRef.current = Math.max(sinceIdRef.current, ev.id);
            setEvents((prev) => {
              const next = [ev, ...prev];
              if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
              return next;
            });
          } catch {
            /* ignore malformed */
          }
        });
      }

      es.addEventListener("state", (msg) => {
        try {
          const s = JSON.parse((msg as MessageEvent).data) as HunterState;
          setState(s);
        } catch {
          /* ignore malformed */
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (retryHandle) clearTimeout(retryHandle);
      es?.close();
    };
  }, []);

  return { events, state, connected };
}

export async function startHunter(minValueScore: number): Promise<HunterState> {
  const res = await fetch(`${API_BASE}/hunter/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minValueScore }),
  });
  if (!res.ok) throw new Error(`Failed to start: ${res.status}`);
  return (await res.json()) as HunterState;
}

export async function stopHunter(): Promise<HunterState> {
  const res = await fetch(`${API_BASE}/hunter/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to stop: ${res.status}`);
  return (await res.json()) as HunterState;
}

export async function resetHunterMemory(): Promise<HunterState> {
  const res = await fetch(`${API_BASE}/hunter/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to reset: ${res.status}`);
  return (await res.json()) as HunterState;
}

export async function fetchInsights(): Promise<HunterInsights> {
  const res = await fetch(`${API_BASE}/hunter/insights`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as HunterInsights;
}

export interface Discovery {
  id: number;
  fqdn: string;
  name: string;
  tld: string;
  category: string;
  strategy: string;
  pattern: string;
  length: number;
  valueScore: number;
  memorability: number;
  radioTest: boolean;
  rationale: string;
  dnsEvidence: string;
  discoveredAt: string;
}

export interface DiscoveriesResponse {
  total: number;
  offset: number;
  limit: number;
  items: Discovery[];
}

export async function testTelegram(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/hunter/telegram-test`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as { ok: boolean; error?: string };
}

export async function fetchDiscoveries(params: {
  limit?: number;
  offset?: number;
  minScore?: number;
  category?: string;
  strategy?: string | null;
  length?: number | null;
  sortBy?: "score" | "value";
  minValue?: number;
}): Promise<DiscoveriesResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null && params.offset > 0) qs.set("offset", String(params.offset));
  if (params.minScore != null) qs.set("minScore", String(params.minScore));
  if (params.category && params.category !== "all") qs.set("category", params.category);
  if (params.strategy && params.strategy !== "all") qs.set("strategy", params.strategy);
  if (params.length != null) qs.set("length", String(params.length));
  if (params.sortBy === "value") qs.set("sortBy", "value");
  if (params.minValue != null && params.minValue > 0) qs.set("minValue", String(params.minValue));
  const res = await fetch(`${API_BASE}/discoveries?${qs.toString()}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as DiscoveriesResponse;
}

export interface NewsEvent {
  id: number;
  source: string;
  title: string;
  url: string | null;
  categories: string[];
  keywords: string[];
  impactScore: number;
  publishedAt: string;
  ingestedAt: string;
}

export interface TrendSignal {
  keyword: string;
  category: string;
  count24h: number;
  count7d: number;
  weight: number;
  lastSeenAt: string;
}

export interface NewsStatus {
  running: boolean;
  lastRunAt: string | null;
  lastIngested: number;
  totalIngested: number;
  totalDuplicates: number;
  runs: number;
}

export async function fetchNewsStatus(): Promise<NewsStatus> {
  const res = await fetch(`${API_BASE}/news/status`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as NewsStatus;
}

export async function fetchRecentNews(limit = 10): Promise<NewsEvent[]> {
  const res = await fetch(`${API_BASE}/news/events?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as NewsEvent[];
}

export async function fetchTopTrends(limit = 20): Promise<TrendSignal[]> {
  const res = await fetch(`${API_BASE}/news/trends?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as TrendSignal[];
}

export async function triggerNewsIngest(): Promise<unknown> {
  const res = await fetch(`${API_BASE}/news/ingest`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return await res.json();
}
