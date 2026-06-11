import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Check, CheckCircle2, Copy, Download, ExternalLink,
  Eye, EyeOff, Filter, Gem, RefreshCw, Shield, TrendingUp, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchDiscoveries, markAsSeen, markAsUnseen,
  fetchNewsStatus, type Discovery,
} from "@/hooks/use-hunter-stream";

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const CAT_COLOR: Record<string, string> = {
  ai: "border-violet-400/40 text-violet-200 bg-violet-500/10",
  quantum: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10",
  biotech: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  green_energy: "border-lime-400/40 text-lime-200 bg-lime-500/10",
  space_tech: "border-amber-400/40 text-amber-200 bg-amber-500/10",
};

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI" },
  { key: "quantum", label: "Quantum" },
  { key: "biotech", label: "Biotech" },
  { key: "green_energy", label: "Green Energy" },
  { key: "space_tech", label: "Space-Tech" },
];

const DATE_FILTERS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

function sinceDate(key: string): string | null {
  const now = new Date();
  if (key === "today") { now.setHours(0,0,0,0); return now.toISOString(); }
  if (key === "week") { now.setDate(now.getDate() - 7); return now.toISOString(); }
  if (key === "month") { now.setMonth(now.getMonth() - 1); return now.toISOString(); }
  return null;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { void navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="p-1 rounded border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function csvExport(items: Discovery[]) {
  const header = "fqdn,name,category,length,score,diamond,ai_score,ai_reason,radio_test,discovered_at,seen,register_url";
  const rows = items.map((d) => [
    d.fqdn, d.name, d.category, d.length, d.valueScore,
    d.isDiamond ? "yes" : "no",
    d.diamondScore ?? "", (d.diamondReason ?? "").replace(/,/g, ";"),
    d.radioTest ? "pass" : "-", d.discoveredAt, d.viewedAt ? "yes" : "no",
    `https://www.namecheap.com/domains/registration/results/?domain=${d.fqdn}`,
  ].join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `diamonds-${new Date().toISOString().slice(0,10)}-${items.length}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

export function FoundDomains() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [diamondOnly, setDiamondOnly] = useState(false);
  const [seenMap, setSeenMap] = useState<Record<number, boolean>>({});

  const params = {
    limit: 500, minScore: 0, category,
    since: sinceDate(dateFilter),
    unseen: unseenOnly || undefined,
    diamond: diamondOnly || undefined,
  } as const;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["found-domains", category, dateFilter, unseenOnly, diamondOnly],
    queryFn: () => fetchDiscoveries(params),
    refetchInterval: 30000,
  });

  const newsQ = useQuery({ queryKey: ["news-status"], queryFn: fetchNewsStatus, refetchInterval: 60000 });

  const items = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort((a, b) => {
      // AI diamonds always first, then by score
      if (a.isDiamond !== b.isDiamond) return a.isDiamond ? -1 : 1;
      return b.valueScore - a.valueScore;
    });
  }, [data]);

  const diamonds = items.filter((d) => d.isDiamond);
  const unseen = items.filter((d) => !d.viewedAt && !(seenMap[d.id]));

  async function toggleSeen(d: Discovery) {
    const isSeen = !!d.viewedAt || !!seenMap[d.id];
    setSeenMap((m) => ({ ...m, [d.id]: !isSeen }));
    if (isSeen) await markAsUnseen(d.id);
    else await markAsSeen(d.id);
    void qc.invalidateQueries({ queryKey: ["found-domains"] });
  }

  const hunter = newsQ.data;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Gem className="h-6 w-6 text-primary" />
            Found Domains
            {diamonds.length > 0 && (
              <span className="ml-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-sm font-semibold text-cyan-200">
                {diamonds.length} 💎 AI diamonds
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-evaluated .com domains found by the hunter. 💎 = confirmed diamond by GPT-4o-mini (50 factors).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", isLoading && "animate-spin")} /> Refresh
          </Button>
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => csvExport(items)}
              className="border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10">
              <Download className="mr-1 h-3.5 w-3.5" /> Export CSV ({items.length})
            </Button>
          )}
        </div>
      </div>

      {/* 24/7 Monitoring strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total found</div>
          <div className="mt-1 text-xl font-bold">{(data?.total ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/5 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">AI diamonds 💎</div>
          <div className="mt-1 text-xl font-bold text-cyan-200">{diamonds.length}</div>
        </div>
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Unseen / new</div>
          <div className="mt-1 text-xl font-bold text-amber-200">{unseen.length}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Shown filter</div>
          <div className="mt-1 text-sm font-semibold">{items.length}</div>
        </div>
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3 text-emerald-400 animate-pulse" /> News engine
          </div>
          <div className="mt-1 text-[11px] font-semibold text-emerald-300">
            {hunter ? `${hunter.totalIngested.toLocaleString()} events` : "Connecting…"}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3 text-violet-400" /> Last ingest
          </div>
          <div className="mt-1 text-[11px] font-semibold">
            {hunter?.lastRunAt ? timeAgo(hunter.lastRunAt) : "—"}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/30 px-4 py-3">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Date filter */}
        <div className="flex gap-1">
          {DATE_FILTERS.map((d) => (
            <button key={d.key} onClick={() => setDateFilter(d.key)}
              className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                dateFilter === d.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Category */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                category === c.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Smart toggles */}
        <button onClick={() => setUnseenOnly(!unseenOnly)}
          className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium border transition-colors",
            unseenOnly ? "border-amber-400/50 bg-amber-500/10 text-amber-200" : "border-border/50 text-muted-foreground hover:border-border"
          )}>
          <Eye className="h-3 w-3" /> Unseen only
        </button>

        <button onClick={() => setDiamondOnly(!diamondOnly)}
          className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium border transition-colors",
            diamondOnly ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-border/50 text-muted-foreground hover:border-border"
          )}>
          💎 AI diamonds only
        </button>
      </div>

      {/* Table */}
      {isLoading && items.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/30 py-20 text-center">
          <Gem className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-base font-semibold">No domains match this filter</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try "All time" or remove filters. Hunter is scanning in background.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left w-6">#</th>
                <th className="px-3 py-2.5 text-left">Domain</th>
                <th className="px-3 py-2.5 text-center">AI Check</th>
                <th className="px-3 py-2.5 text-center hidden md:table-cell">Category</th>
                <th className="px-3 py-2.5 text-right">Score</th>
                <th className="px-3 py-2.5 text-center hidden lg:table-cell">Len</th>
                <th className="px-3 py-2.5 text-center hidden lg:table-cell">Found</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => {
                const isSeen = !!d.viewedAt || !!seenMap[d.id];
                const godaddy = `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.fqdn)}`;
                const namecheap = `https://www.namecheap.com/domains/registration/results/?domain=${d.fqdn}`;
                return (
                  <tr key={d.id}
                    className={cn("border-t border-border/40 transition-colors hover:bg-muted/15",
                      d.isDiamond && "bg-cyan-500/5 hover:bg-cyan-500/8",
                      isSeen && "opacity-50",
                    )}>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums text-[11px]">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {d.isDiamond && <span className="text-base" title="AI diamond">💎</span>}
                        <span className={cn("font-mono font-semibold", d.isDiamond && "text-cyan-200")}>{d.fqdn}</span>
                        <CopyBtn text={d.fqdn} />
                        {isSeen && <span className="text-[9px] text-muted-foreground border border-border/40 rounded px-1">seen</span>}
                      </div>
                      {d.diamondReason && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-xs" title={d.diamondReason}>
                          {d.diamondReason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {d.diamondScore != null ? (
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          d.isDiamond
                            ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                            : d.diamondScore >= 50
                              ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                              : "border-border/40 text-muted-foreground"
                        )}>
                          <Shield className="h-2.5 w-2.5" /> {d.diamondScore}/100
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">pending…</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center hidden md:table-cell">
                      <Badge variant="outline" className={cn("text-[10px] uppercase", CAT_COLOR[d.category])}>
                        {d.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn("font-semibold tabular-nums",
                        d.valueScore >= 80 ? "text-emerald-300" : d.valueScore >= 60 ? "text-amber-300" : "text-muted-foreground"
                      )}>
                        {d.valueScore}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center hidden lg:table-cell text-muted-foreground">{d.length}</td>
                    <td className="px-3 py-2 text-center hidden lg:table-cell text-muted-foreground text-[11px]">
                      {timeAgo(d.discoveredAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => void toggleSeen(d)}
                          title={isSeen ? "Mark unseen" : "Mark seen"}
                          className="p-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border">
                          {isSeen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <a href={namecheap} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-emerald-400/40 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/10">
                          NC <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        <a href={godaddy} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary">
                          GD <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Hunter scans 24/7 · AI evaluates every available .com with 50 factors ·
        💎 diamonds go to Telegram · Mark as seen to declutter · Export includes all columns
      </p>
    </div>
  );
}
