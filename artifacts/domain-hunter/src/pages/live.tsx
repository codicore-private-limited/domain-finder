import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  Flame,
  Gauge,
  Gem,
  LayoutGrid,
  List,
  Newspaper,
  Pause,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchDiscoveries,
  fetchNewsStatus,
  fetchRecentNews,
  fetchTopTrends,
  resetHunterMemory,
  startHunter,
  stopHunter,
  testTelegram,
  triggerNewsIngest,
  useHunterStream,
  type Discovery,
  type HunterEvent,
  type NewsEvent,
  type TrendSignal,
} from "@/hooks/use-hunter-stream";

const CATEGORIES = [
  { key: "all", label: "All sectors" },
  { key: "ai", label: "AI" },
  { key: "quantum", label: "Quantum" },
  { key: "biotech", label: "Biotech" },
  { key: "green_energy", label: "Green Energy" },
  { key: "space_tech", label: "Space-Tech" },
];

const CATEGORY_LABEL: Record<string, string> = {
  ai: "AI",
  quantum: "Quantum",
  biotech: "Biotech",
  green_energy: "Green Energy",
  space_tech: "Space-Tech",
};

const CATEGORY_COLOR: Record<string, string> = {
  ai: "border-violet-400/40 text-violet-200 bg-violet-500/10",
  quantum: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10",
  biotech: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  green_energy: "border-lime-400/40 text-lime-200 bg-lime-500/10",
  space_tech: "border-amber-400/40 text-amber-200 bg-amber-500/10",
};

const STRATEGY_LABEL: Record<string, string> = {
  real_phrase: "Meaningful Phrase",
  one_word_real: "Real Word",
  two_word_real: "Meaningful Phrase",
  three_word_real: "Meaningful Phrase",
  four_letter_real: "Real Word",
  news_driven: "Trending Phrase",
  brandable_cvcv: "Brandable CVCV",
  future_suffix: "Future Suffix",
  dictionary_hack: "Dictionary Hack",
  two_word_brandable: "Two-Word Brand",
  pronounceable_word: "Dictionary Word",
  transliteration: "Transliteration",
  prefix_root: "Prefix-Root",
  color_tech: "Color-Tech",
  vowel_start: "Vowel-Start",
  portmanteau: "Portmanteau",
  short_suffix: "Short Suffix",
};

const PAGE_SIZE = 200;
// Export size choices (Infinity = every match). User-selectable.
const EXPORT_OPTIONS: { label: string; value: number }[] = [
  { label: "Top 2,000", value: 2000 },
  { label: "Top 10,000", value: 10000 },
  { label: "Top 50,000", value: 50000 },
  { label: "All matches", value: Number.MAX_SAFE_INTEGER },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function scoreBg(score: number): string {
  if (score >= 90) return "from-emerald-500/20 to-emerald-500/5 border-emerald-400/40";
  if (score >= 80) return "from-cyan-500/15 to-cyan-500/5 border-cyan-400/40";
  if (score >= 70) return "from-amber-500/15 to-amber-500/5 border-amber-400/40";
  return "from-card/40 to-card/10 border-border";
}

function demandWord(score: number): string {
  if (score >= 85) return "Very high real-world usage";
  if (score >= 65) return "High real-world usage";
  if (score >= 45) return "Solid real-world usage";
  return "Niche real-world usage";
}

function whyBest(d: Discovery): string[] {
  return [
    `"${d.name}" is a genuinely meaningful phrase people actually use — a clean, brandable .com (no random letters, no junk words).`,
    `${demandWord(d.valueScore)} — this concept is searched/written in the real world, so a real buyer would want it.`,
    `Only ${d.length} letters — short, meaningful .coms are the ones that actually resell for lakhs/crores.`,
    `Easy to say, type and remember (radio-test ${d.radioTest ? "passed" : "borderline"}).`,
    `Verified genuinely available right now via Verisign RDAP — always do a final USPTO/WIPO trademark check before buying.`,
  ];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
    >
      {copied ? (
        <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> copied</>
      ) : (
        <><Copy className="h-3 w-3" /> copy</>
      )}
    </button>
  );
}

function CompactRow({ d, onExpand }: { d: Discovery; onExpand: () => void }) {
  const godaddyUrl = `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.fqdn)}`;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-gradient-to-r px-3 py-2 transition-colors hover:border-primary/40",
        scoreBg(d.valueScore),
      )}
    >
      <div className="shrink-0 w-10 text-right" title="Verified available .com">
        <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-semibold truncate">{d.name}</span>
          <span className="text-[11px] text-muted-foreground">.{d.tld}</span>
          <span
            className={cn(
              "hidden sm:inline-flex items-center rounded px-1 py-px text-[9px] uppercase tracking-wider border",
              CATEGORY_COLOR[d.category] ?? "border-border text-muted-foreground",
            )}
          >
            {CATEGORY_LABEL[d.category] ?? d.category}
          </span>
          <span className="hidden md:inline text-[10px] text-muted-foreground font-mono">{d.pattern}</span>
          <span className="hidden md:inline text-[10px] text-muted-foreground">{d.length}L</span>
        </div>
      </div>
      <button
        onClick={onExpand}
        title="View full details"
        className="shrink-0 rounded border border-border/60 p-1 text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <CopyButton text={d.fqdn} />
      <a
        href={godaddyUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 inline-flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary"
      >
        Register <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function DiamondCard({ d }: { d: Discovery }) {
  const godaddyUrl = `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.fqdn)}`;
  const afternicUrl = `https://www.afternic.com/domain/${encodeURIComponent(d.fqdn)}`;
  const points = whyBest(d);
  return (
    <article
      className={cn(
        "rounded-xl border bg-gradient-to-br p-5 transition-all hover:shadow-[0_0_0_1px_rgba(56,189,248,0.25)]",
        scoreBg(d.valueScore),
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-mono text-2xl font-bold tracking-tight truncate">{d.name}</h3>
            <span className="text-xl font-mono text-muted-foreground/70">.{d.tld}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", CATEGORY_COLOR[d.category])}>
              {CATEGORY_LABEL[d.category] ?? d.category}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground">
              {d.length} letters
            </Badge>
            <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground font-mono">
              {d.pattern}
            </Badge>
            {d.radioTest && (
              <Badge variant="outline" className="text-[10px] border-emerald-400/40 text-emerald-300 bg-emerald-500/10">
                Radio-test pass
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-[10px] border-cyan-400/40 text-cyan-200 bg-cyan-500/10"
              title="Verisign RDAP confirms this .com is genuinely unregistered"
            >
              <ShieldCheck className="mr-1 h-3 w-3" /> RDAP-verified free
            </Badge>
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-right">
          <div className="flex items-center gap-1.5 text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Available</span>
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            {demandWord(d.valueScore)}
          </div>
        </div>
      </header>

      <section className="mt-4 rounded-md border border-border/40 bg-background/30 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-300" /> Why this is a gem
        </div>
        <ul className="space-y-1.5 text-[12px] leading-relaxed text-foreground/85">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-3 rounded-md border border-border/40 bg-background/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">AI rationale</div>
        <p className="text-[12px] leading-relaxed text-foreground/80">{d.rationale}</p>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-border/40 bg-background/20 px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">DNS evidence</div>
          <div className="mt-0.5 font-mono text-foreground/80 truncate" title={d.dnsEvidence}>{d.dnsEvidence}</div>
        </div>
        <div className="rounded border border-border/40 bg-background/20 px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Memorability</div>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded bg-muted/40 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${Math.min(100, d.memorability)}%` }} />
            </div>
            <span className="font-mono tabular-nums">{d.memorability}</span>
          </div>
        </div>
      </section>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground">
          Found {timeAgo(d.discoveredAt)} · {STRATEGY_LABEL[d.strategy] ?? d.strategy}
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={d.fqdn} />
          <a
            href={afternicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            Afternic <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={godaddyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-primary/90 px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary"
          >
            Register <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </footer>
    </article>
  );
}

function HeroStat({
  icon, label, value, sub, accent = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "emerald" | "cyan" | "amber" | "violet" | "rose";
}) {
  const accentClass =
    accent === "emerald" ? "from-emerald-500/20 to-emerald-500/5 border-emerald-400/40 text-emerald-300"
      : accent === "cyan" ? "from-cyan-500/15 to-cyan-500/5 border-cyan-400/40 text-cyan-300"
        : accent === "amber" ? "from-amber-500/15 to-amber-500/5 border-amber-400/40 text-amber-300"
          : accent === "violet" ? "from-violet-500/15 to-violet-500/5 border-violet-400/40 text-violet-300"
            : accent === "rose" ? "from-rose-500/15 to-rose-500/5 border-rose-400/40 text-rose-300"
              : "from-card/60 to-card/10 border-border text-foreground";
  return (
    <div className={cn("rounded-xl border bg-gradient-to-br p-4", accentClass)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="opacity-70">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function eventDot(kind: HunterEvent["kind"]): string {
  switch (kind) {
    case "discovery": return "bg-emerald-400";
    case "phase": return "bg-violet-400";
    case "generated": return "bg-cyan-400";
    case "error": return "bg-rose-400";
    case "info": return "bg-amber-400";
    default: return "bg-muted-foreground";
  }
}

function NewsIntelligenceStrip({
  status,
  events,
  trends,
  onRefresh,
}: {
  status: { running: boolean; lastRunAt: string | null; lastIngested: number; totalIngested: number; runs: number } | null;
  events: NewsEvent[];
  trends: TrendSignal[];
  onRefresh: () => void;
}) {
  const top5Trends = trends.slice(0, 8);
  return (
    <div className="mb-4 rounded-lg border border-violet-400/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-semibold">News Intelligence Engine</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {status?.running ? "live" : "idle"}
            {status?.lastRunAt && ` · last ${timeAgo(status.lastRunAt)}`}
            {status && ` · ${status.totalIngested.toLocaleString()} events ingested`}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          className="h-7 text-[11px] border-violet-400/40 text-violet-300 hover:bg-violet-500/10"
        >
          <RefreshCw className="mr-1 h-3 w-3" /> Pull now
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Latest market signals (driving keywords into hunter)
          </div>
          <ul className="space-y-1.5">
            {events.length === 0 && (
              <li className="text-xs text-muted-foreground">Warming up — first ingestion in progress…</li>
            )}
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[12px] leading-snug">
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    e.impactScore >= 70
                      ? "bg-emerald-400"
                      : e.impactScore >= 50
                      ? "bg-cyan-400"
                      : "bg-amber-400",
                  )}
                />
                <div className="min-w-0 flex-1">
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground/90 hover:text-primary truncate block"
                    >
                      {e.title}
                    </a>
                  ) : (
                    <span className="text-foreground/90">{e.title}</span>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{e.source}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">impact {e.impactScore}</span>
                    {e.categories.map((c) => (
                      <span
                        key={c}
                        className={cn(
                          "text-[9px] uppercase tracking-wider rounded px-1.5 py-px border",
                          CATEGORY_COLOR[c] ?? "border-border text-muted-foreground",
                        )}
                      >
                        {CATEGORY_LABEL[c] ?? c}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Top trending keywords
          </div>
          <div className="flex flex-wrap gap-1.5">
            {top5Trends.length === 0 && (
              <span className="text-xs text-muted-foreground">Aggregating signals…</span>
            )}
            {top5Trends.map((t) => (
              <span
                key={t.keyword}
                className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-200"
                title={`${t.count24h} mentions in 24h · weight ${t.weight}`}
              >
                {t.keyword}
                <span className="text-cyan-400/60">·{Math.round(t.weight)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function csvSafe(s: string): string {
  if (s == null) return "";
  const v = String(s);
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function exportCsv(items: Discovery[]) {
  const header = "name,fqdn,length,pattern,category,strategy,memorability,radio_test,discovered_at,rationale,rdap_status,register_url";
  const rows = items.map((d) =>
    [
      csvSafe(d.name),
      csvSafe(d.fqdn),
      d.length,
      csvSafe(d.pattern),
      csvSafe(d.category),
      csvSafe(d.strategy),
      d.memorability,
      d.radioTest ? "pass" : "borderline",
      csvSafe(d.discoveredAt),
      csvSafe(d.rationale ?? ""),
      "RDAP-verified free",
      `https://www.godaddy.com/domainsearch/find?domainToCheck=${d.fqdn}`,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `domains-${new Date().toISOString().slice(0, 10)}-${items.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Live() {
  const { events, state, connected } = useHunterStream();
  const [minScore] = useState(0);
  const [category, setCategory] = useState("all");
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);
  const [lengthFilter, setLengthFilter] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<Discovery[]>([]);
  const [viewMode, setViewMode] = useState<"compact" | "detailed">("compact");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportLimit, setExportLimit] = useState(2000);
  const [telegramStatus, setTelegramStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const queryClient = useQueryClient();
  const filtersKey = `${minScore}-${category}-${strategyFilter ?? ""}-${String(lengthFilter)}`;
  const prevFiltersKeyRef = useRef(filtersKey);

  // Reset pagination when filters change
  useEffect(() => {
    if (prevFiltersKeyRef.current !== filtersKey) {
      prevFiltersKeyRef.current = filtersKey;
      setOffset(0);
      setAllItems([]);
    }
  }, [filtersKey]);

  const discoveriesQuery = useQuery({
    queryKey: ["discoveries", minScore, category, strategyFilter, lengthFilter, offset],
    queryFn: () =>
      fetchDiscoveries({
        limit: PAGE_SIZE,
        offset,
        minScore,
        category,
        strategy: strategyFilter,
        length: lengthFilter,
        sortBy: "value",
      }),
    refetchInterval: offset === 0 ? 4000 : false,
  });

  // Accumulate pages
  useEffect(() => {
    if (!discoveriesQuery.data) return;
    if (offset === 0) {
      setAllItems(discoveriesQuery.data.items);
    } else {
      setAllItems((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const fresh = discoveriesQuery.data!.items.filter((d) => !seen.has(d.id));
        return [...prev, ...fresh];
      });
    }
  }, [discoveriesQuery.data, offset]);

  // Invalidate on new discoveries
  useEffect(() => {
    if (events[0]?.kind === "discovery") {
      void queryClient.invalidateQueries({
        queryKey: ["discoveries", minScore, category, strategyFilter, lengthFilter, 0],
      });
    }
  }, [events, queryClient, minScore, category, strategyFilter, lengthFilter]);

  const running = state?.running ?? false;
  const totalEvaluated = state?.totalEvaluated ?? 0;
  const totalChecked = state?.totalChecked ?? 0;
  const evaluatedPerSecond = state?.evaluatedPerSecond ?? 0;
  const checksPerSecond = state?.checksPerSecond ?? 0;
  const everSearched = state?.everSearchedSize ?? state?.recentNamesSize ?? 0;
  const rdapVerified = state?.totalRdapVerified ?? 0;
  const rdapRejected = state?.totalRdapFalsePositives ?? 0;
  const cleanupRunning = state?.cleanupRunning ?? false;
  const cleanupChecked = state?.cleanupChecked ?? 0;
  const cleanupRemoved = state?.cleanupRemoved ?? 0;
  const totalDuplicateSkips = state?.totalDuplicateSkips ?? 0;
  const effectiveMinScore = state?.effectiveMinScore ?? 70;
  const totalInDb = discoveriesQuery.data?.total ?? 0;

  // Honest per-bucket diamond counts derived from the diamonds actually shown,
  // so the sidebar never claims a diamond the vault list does not contain.
  const diamondsByStrategy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of allItems) m[d.strategy] = (m[d.strategy] ?? 0) + 1;
    return m;
  }, [allItems]);
  const diamondsByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of allItems) m[d.category] = (m[d.category] ?? 0) + 1;
    return m;
  }, [allItems]);

  const hasMore = allItems.length < totalInDb;

  const handleToggle = useCallback(async () => {
    if (running) await stopHunter();
    else await startHunter(minScore);
  }, [running, minScore]);

  // Push slider changes to hunter engine (not just vault filter).
  useEffect(() => {
    if (!running) return;
    void startHunter(minScore).catch(() => {});
  }, [minScore, running]);

  const handleResetMemory = useCallback(async () => {
    await resetHunterMemory();
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const resp = await fetchDiscoveries({
        limit: exportLimit,
        offset: 0,
        minScore,
        category,
        strategy: strategyFilter,
        length: lengthFilter,
      });
      exportCsv(resp.items);
    } catch {
      exportCsv(allItems);
    } finally {
      setExporting(false);
    }
  }, [allItems, exportLimit, minScore, category, strategyFilter, lengthFilter]);

  const handleTelegramTest = useCallback(async () => {
    setTelegramStatus("testing");
    try {
      const result = await testTelegram();
      setTelegramStatus(result.ok ? "ok" : "error");
      setTimeout(() => setTelegramStatus("idle"), 5000);
    } catch {
      setTelegramStatus("error");
      setTimeout(() => setTelegramStatus("idle"), 5000);
    }
  }, []);

  // News intelligence queries (refresh every 60s).
  const newsStatusQuery = useQuery({
    queryKey: ["news-status"],
    queryFn: fetchNewsStatus,
    refetchInterval: 60_000,
  });
  const recentNewsQuery = useQuery({
    queryKey: ["news-recent"],
    queryFn: () => fetchRecentNews(8),
    refetchInterval: 60_000,
  });
  const topTrendsQuery = useQuery({
    queryKey: ["news-trends"],
    queryFn: () => fetchTopTrends(20),
    refetchInterval: 60_000,
  });

  const handleNewsRefresh = useCallback(async () => {
    try {
      await triggerNewsIngest();
      void queryClient.invalidateQueries({ queryKey: ["news-status"] });
      void queryClient.invalidateQueries({ queryKey: ["news-recent"] });
      void queryClient.invalidateQueries({ queryKey: ["news-trends"] });
    } catch {
      /* ignore */
    }
  }, [queryClient]);

  return (
    <div className="px-6 py-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Diamond Hunting Cockpit</h1>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
              connected ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10" : "border-rose-400/40 text-rose-300 bg-rose-500/10",
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-rose-400")} />
              {connected ? "Live stream" : "Reconnecting"}
            </span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
              running ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground",
            )}>
              {running ? "Hunter ARMED" : "Hunter idle"}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            Pro-grade .com diamond finder — only 5–7 letter brandable names in deep-tech (AI, Quantum, Biotech, Green Energy, Space-Tech). Every candidate is{" "}
            <span className="text-cyan-300">DNS-checked</span> then{" "}
            <span className="text-emerald-300">Verisign RDAP confirmed</span> truly unregistered. Names already searched are remembered forever.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void handleTelegramTest()}
            size="sm"
            variant="outline"
            disabled={telegramStatus === "testing"}
            className={cn(
              "border transition-all",
              telegramStatus === "ok" ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10" :
              telegramStatus === "error" ? "border-rose-400/60 text-rose-300 bg-rose-500/10" :
              "border-sky-400/40 text-sky-300 hover:bg-sky-500/10",
            )}
            title="Test Telegram bot — sends a test message to your Telegram"
          >
            {telegramStatus === "testing" ? (
              <><Bell className="mr-1 h-3.5 w-3.5 animate-pulse" /> Connecting…</>
            ) : telegramStatus === "ok" ? (
              <><BellRing className="mr-1 h-3.5 w-3.5" /> Telegram ✓</>
            ) : telegramStatus === "error" ? (
              <><Bell className="mr-1 h-3.5 w-3.5" /> Alert Error</>
            ) : (
              <><Bell className="mr-1 h-3.5 w-3.5" /> Test Alerts</>
            )}
          </Button>
          <Button
            onClick={handleResetMemory}
            size="sm"
            variant="outline"
            className="border-amber-400/40 text-amber-300 hover:bg-amber-500/10"
            title="Reset session counters"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Reset counters
          </Button>
          <Button
            onClick={() => void handleToggle()}
            size="sm"
            variant={running ? "outline" : "default"}
            className={cn(
              running ? "border-rose-400/50 text-rose-300 hover:bg-rose-500/10" : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {running ? <><Pause className="mr-1 h-3.5 w-3.5" /> Pause</> : <><Play className="mr-1 h-3.5 w-3.5" /> Resume</>}
          </Button>
        </div>
      </header>

      {/* Hero stats */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <HeroStat icon={<Flame className="h-4 w-4" />} label="Evaluated / sec" value={fmt(evaluatedPerSecond)}
          sub={`${fmt(totalEvaluated)} total · in-memory`} accent="amber" />
        <HeroStat icon={<Radar className="h-4 w-4" />} label="DNS / sec" value={fmt(checksPerSecond)}
          sub={`${fmt(totalChecked)} probed · top-scored`} accent="cyan" />
        <HeroStat icon={<Gem className="h-4 w-4" />} label="Diamonds in vault" value={fmt(totalInDb)}
          sub="RDAP-verified available .com · best first" accent="emerald" />
        <HeroStat icon={<ShieldCheck className="h-4 w-4" />} label="RDAP verified" value={fmt(rdapVerified)}
          sub={`${fmt(rdapRejected)} parked/sale rejected`} accent="violet" />
        <HeroStat icon={<Database className="h-4 w-4" />} label="Lifetime memory" value={fmt(everSearched)}
          sub={`${fmt(totalDuplicateSkips)} dupes blocked`} />
        <HeroStat icon={<Gauge className="h-4 w-4" />} label="Score gate" value={`≥ ${effectiveMinScore}`}
          sub="auto-tuned · premium only" />
      </section>

      {/* Cleanup banner */}
      {cleanupRunning && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <Zap className="h-4 w-4 shrink-0" />
          <span>
            Background RDAP re-verification of vault — removing parked/for-sale.{" "}
            <span className="font-semibold">{cleanupChecked.toLocaleString()}</span> checked ·{" "}
            <span className="font-semibold">{cleanupRemoved.toLocaleString()}</span> removed
          </span>
        </div>
      )}

      {/* News Intelligence Strip */}
      <NewsIntelligenceStrip
        status={newsStatusQuery.data ?? null}
        events={recentNewsQuery.data ?? []}
        trends={topTrendsQuery.data ?? []}
        onRefresh={handleNewsRefresh}
      />

      {/* Filter strip */}
      <div className="mb-4 rounded-lg border border-border bg-card/30 px-4 py-3 space-y-3">
        {/* Row 1: vault title + score slider + export */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gem className="h-4 w-4 text-emerald-300" />
            <h2 className="text-sm font-semibold">Diamond vault</h2>
            <span className="text-xs text-muted-foreground">
              {allItems.length.toLocaleString()} shown of {totalInDb.toLocaleString()} matched
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Length filter */}
            <div className="flex items-center gap-1">
              {[null, 5, 6, 7].map((len) => (
                <button
                  key={String(len)}
                  onClick={() => { setLengthFilter(len); setOffset(0); setAllItems([]); }}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium border transition-colors",
                    lengthFilter === len
                      ? "border-primary/60 bg-primary/20 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {len === null ? "All" : `${len}L`}
                </button>
              ))}
            </div>
            {/* Export — customizable size */}
            {allItems.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={exportLimit}
                  onChange={(e) => setExportLimit(Number(e.target.value))}
                  title="How many to export"
                  className="rounded border border-border/50 bg-background/60 px-1.5 py-1 text-[11px] text-foreground"
                >
                  {EXPORT_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => void handleExport()}
                  disabled={exporting}
                  className="border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10 text-[11px] h-7 px-2">
                  <Download className="h-3 w-3 mr-1" />
                  {exporting ? "Exporting…" : `Export CSV (${Math.min(exportLimit, totalInDb).toLocaleString()})`}
                </Button>
              </div>
            )}
            {/* View toggle */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode("compact")}
                title="Compact list (name + score)"
                className={cn(
                  "rounded px-1.5 py-1 text-[11px] border transition-colors",
                  viewMode === "compact"
                    ? "border-primary/60 bg-primary/20 text-primary"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("detailed")}
                title="Detailed cards"
                className={cn(
                  "rounded px-1.5 py-1 text-[11px] border transition-colors",
                  viewMode === "detailed"
                    ? "border-primary/60 bg-primary/20 text-primary"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: category tabs */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => { setCategory(cat.key); setOffset(0); setAllItems([]); }}
              className={cn(
                "rounded-full border px-3 py-0.5 text-[11px] font-medium transition-colors",
                category === cat.key
                  ? cat.key === "all"
                    ? "border-primary/60 bg-primary/20 text-primary"
                    : cn("border-border", CATEGORY_COLOR[cat.key] ?? "text-foreground")
                  : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {cat.label}
            </button>
          ))}
          {strategyFilter && (
            <button
              onClick={() => { setStrategyFilter(null); setOffset(0); setAllItems([]); }}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/10 px-3 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
              title="Clear strategy filter"
            >
              Strategy: {STRATEGY_LABEL[strategyFilter] ?? strategyFilter}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Diamond cards */}
        <section>
          {discoveriesQuery.isLoading && allItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 px-6 py-16 text-center text-sm text-muted-foreground">
              Loading diamonds…
            </div>
          )}
          {!discoveriesQuery.isLoading && allItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 px-6 py-16 text-center">
              <Gem className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <h3 className="text-base font-semibold">No finds at this filter yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Change the category or length filter, or wait — the hunter is scanning 24/7 and new verified-available .com names land here automatically.
              </p>
            </div>
          )}
          {allItems.length > 0 && (
            <>
              {viewMode === "detailed" ? (
                <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                  {allItems.map((d) => <DiamondCard key={d.id} d={d} />)}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {allItems.map((d) => (
                    <CompactRow key={d.id} d={d} onExpand={() => setExpandedId(d.id)} />
                  ))}
                </div>
              )}
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={discoveriesQuery.isFetching}
                    className="border-border/60 text-muted-foreground hover:text-foreground gap-2"
                  >
                    <ChevronDown className="h-4 w-4" />
                    {discoveriesQuery.isFetching
                      ? "Loading…"
                      : `Load ${Math.min(PAGE_SIZE, totalInDb - allItems.length)} more · ${(totalInDb - allItems.length).toLocaleString()} remaining`}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Telemetry sidebar */}
        <aside className="lg:sticky lg:top-[74px] lg:self-start">
          <div className="rounded-lg border border-border bg-card/30">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-300" />
                <h3 className="text-sm font-semibold">Hunter telemetry</h3>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">live</span>
            </div>
            {state?.currentCategory && state.currentStrategy && (
              <div className="border-b border-border/40 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-violet-200">
                  <Cpu className="h-3.5 w-3.5" />
                  <span className="font-medium">{CATEGORY_LABEL[state.currentCategory] ?? state.currentCategory}</span>
                  <span className="text-muted-foreground">via</span>
                  <span className="font-medium">{STRATEGY_LABEL[state.currentStrategy] ?? state.currentStrategy}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Cycle #{state.cycle} · batch {state.batchSize} · concurrency {state.concurrency}
                </div>
              </div>
            )}
            <div className="h-[400px] overflow-y-auto px-3 py-3 space-y-2">
              {events.length === 0 && (
                <p className="text-center text-xs text-muted-foreground pt-8">Warming up…</p>
              )}
              {events.map((ev) => (
                <div key={ev.id} className="flex gap-2 text-[11px] leading-relaxed">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", eventDot(ev.kind))} />
                  <div className="min-w-0">
                    <p className="text-foreground/80 break-words">{ev.message}</p>
                    <p className="text-muted-foreground/60 text-[10px]">
                      {new Date(ev.ts).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-strategy stats mini-table */}
          {state?.perStrategy && (
            <div className="mt-4 rounded-lg border border-border bg-card/30 overflow-hidden">
              <div className="border-b border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Strategy breakdown
              </div>
              <div className="divide-y divide-border/40">
                {Object.entries(state.perStrategy)
                  .filter(([, v]) => v.checked > 0)
                  .sort(([ka], [kb]) => (diamondsByStrategy[kb] ?? 0) - (diamondsByStrategy[ka] ?? 0))
                  .map(([key]) => {
                    const active = strategyFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const next = active ? null : key;
                          setStrategyFilter(next);
                          setOffset(0);
                          setAllItems([]);
                        }}
                        title={active ? "Click to clear filter" : `Filter vault to ${STRATEGY_LABEL[key] ?? key}`}
                        className={cn(
                          "w-full px-4 py-2 text-[11px] flex items-center justify-between gap-2 text-left transition-colors",
                          active
                            ? "bg-primary/15 text-primary"
                            : "hover:bg-card/60",
                        )}
                      >
                        <span className={cn("truncate", active ? "text-primary font-medium" : "text-muted-foreground")}>
                          {STRATEGY_LABEL[key] ?? key}
                        </span>
                        <span className="font-mono text-emerald-300 shrink-0">
                          {(diamondsByStrategy[key] ?? 0).toLocaleString()} 💎
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {state?.perCategory && Object.values(state.perCategory).some((v) => v.checked > 0) && (
            <div className="mt-3 rounded-lg border border-border bg-card/30 overflow-hidden">
              <div className="border-b border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Category breakdown
              </div>
              <div className="divide-y divide-border/40">
                {Object.entries(state.perCategory)
                  .filter(([, v]) => v.checked > 0)
                  .sort(([ka], [kb]) => (diamondsByCategory[kb] ?? 0) - (diamondsByCategory[ka] ?? 0))
                  .map(([key, v]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setCategory(key); setOffset(0); setAllItems([]); }}
                      className={cn(
                        "w-full px-4 py-2 text-[11px] flex items-center justify-between gap-2 text-left transition-colors hover:bg-card/60",
                        category === key ? "bg-primary/15" : "",
                      )}
                    >
                      <span className={cn(
                        "inline-flex items-center rounded px-1.5 py-px text-[9px] uppercase tracking-wider border truncate",
                        CATEGORY_COLOR[key] ?? "border-border text-muted-foreground",
                      )}>
                        {CATEGORY_LABEL[key] ?? key}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground">
                        <span>{v.checked.toLocaleString()} checked</span>
                        <span className="font-mono text-emerald-300">{(diamondsByCategory[key] ?? 0).toLocaleString()} 💎</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Expand modal */}
      {expandedId !== null && (() => {
        const d = allItems.find((x) => x.id === expandedId);
        if (!d) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setExpandedId(null)}
          >
            <div
              className="relative my-12 w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setExpandedId(null)}
                className="absolute -top-3 -right-3 z-10 rounded-full border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <DiamondCard d={d} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
