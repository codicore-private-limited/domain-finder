import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Check, Copy, Download, ExternalLink,
  Eye, EyeOff, Filter, Gem, RefreshCw, Shield, Zap,
  BarChart3, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchDiscoveries, markAsSeen, markAsUnseen, fetchNewsStatus, type Discovery } from "@/hooks/use-hunter-stream";

const CAT_COLOR: Record<string, string> = {
  ai: "border-violet-400/40 text-violet-200 bg-violet-500/10",
  quantum: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10",
  biotech: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  green_energy: "border-lime-400/40 text-lime-200 bg-lime-500/10",
  space_tech: "border-amber-400/40 text-amber-200 bg-amber-500/10",
  news_driven: "border-rose-400/40 text-rose-200 bg-rose-500/10",
};
const CAT_LABEL: Record<string, string> = {
  ai: "AI", quantum: "Quantum", biotech: "Biotech",
  green_energy: "Green Energy", space_tech: "Space-Tech", news_driven: "News 🔥",
};

const CATEGORIES = [
  { key: "all", label: "All sectors" },
  { key: "ai", label: "AI" }, { key: "quantum", label: "Quantum" },
  { key: "biotech", label: "Biotech" }, { key: "green_energy", label: "Green Energy" },
  { key: "space_tech", label: "Space-Tech" }, { key: "news_driven", label: "News 🔥" },
];

const DATE_OPTIONS = [
  { key: "all", label: "All time" }, { key: "today", label: "Today" },
  { key: "week", label: "This week" }, { key: "month", label: "This month" },
];

const EXPORT_SIZE_OPTIONS = [
  { key: "25", label: "Top 25" }, { key: "50", label: "Top 50" },
  { key: "100", label: "Top 100" }, { key: "all", label: "All shown" },
];

function sinceDate(key: string): string | null {
  const now = new Date();
  if (key === "today") { now.setHours(0, 0, 0, 0); return now.toISOString(); }
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
      className="p-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function csvExport(items: Discovery[], label: string) {
  const header = "fqdn,name,category,length,hunter_score,ai_diamond,ai_score,ai_reason,radio_test,discovered_at,status,namecheap_url,godaddy_url";
  const rows = items.map((d) => [
    d.fqdn, d.name, d.category, d.length, d.valueScore,
    d.isDiamond ? "YES" : "no",
    d.diamondScore ?? "pending",
    `"${(d.diamondReason ?? "").replace(/"/g, "'")}"`,
    d.radioTest ? "pass" : "-",
    d.discoveredAt.slice(0, 16).replace("T", " "),
    d.viewedAt ? "seen" : "NEW",
    `https://www.namecheap.com/domains/registration/results/?domain=${d.fqdn}`,
    `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${d.fqdn}`,
  ].join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `diamonds-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

export function FoundDomains() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [diamondOnly, setDiamondOnly] = useState(false);
  const [exportSize, setExportSize] = useState("all");
  const [seenMap, setSeenMap] = useState<Record<number, boolean>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["found-domains", category, dateFilter, unseenOnly, diamondOnly],
    queryFn: () => fetchDiscoveries({
      limit: 500, minScore: 0, category,
      since: sinceDate(dateFilter),
      unseen: unseenOnly || undefined,
      diamond: diamondOnly || undefined,
    }),
    refetchInterval: 30000,
  });

  const newsQ = useQuery({ queryKey: ["news-status"], queryFn: fetchNewsStatus, refetchInterval: 30000 });
  const news = newsQ.data;

  const allItems = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort((a, b) => {
      if (a.isDiamond !== b.isDiamond) return a.isDiamond ? -1 : 1;
      if ((b.diamondScore ?? 0) !== (a.diamondScore ?? 0)) return (b.diamondScore ?? 0) - (a.diamondScore ?? 0);
      return b.valueScore - a.valueScore;
    });
  }, [data]);

  const diamonds = allItems.filter((d) => d.isDiamond);
  const unseen = allItems.filter((d) => !d.viewedAt && !seenMap[d.id]);
  const recent24h = allItems.filter((d) => Date.now() - new Date(d.discoveredAt).getTime() < 86400000);

  async function toggleSeen(d: Discovery) {
    const isSeen = !!d.viewedAt || !!seenMap[d.id];
    setSeenMap((m) => ({ ...m, [d.id]: !isSeen }));
    if (isSeen) await markAsUnseen(d.id);
    else await markAsSeen(d.id);
    void qc.invalidateQueries({ queryKey: ["found-domains"] });
  }

  function getExportItems(items: Discovery[]) {
    if (exportSize === "25") return items.slice(0, 25);
    if (exportSize === "50") return items.slice(0, 50);
    if (exportSize === "100") return items.slice(0, 100);
    return items;
  }

  return (
    <div className="w-full px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      {/* Title */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Gem className="h-6 w-6 text-primary" />
            Diamond Vault
            {diamonds.length > 0 && (
              <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 text-sm font-semibold text-cyan-200">
                {diamonds.length} 💎
              </span>
            )}
            {unseen.length > 0 && (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-sm font-semibold text-amber-300">
                {unseen.length} new
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            AI-curated .com diamonds — GPT-4o-mini applies 50 quality factors BEFORE checking availability.
            💎 = AI confirmed high-value. Hunter runs 24/7 automatically.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isLoading}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", isLoading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* 24/7 Monitoring stats */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: "Total found", value: (data?.total ?? 0).toLocaleString(), icon: <BarChart3 className="h-3.5 w-3.5" />, color: "" },
          { label: "💎 AI Diamonds", value: String(diamonds.length), icon: <Gem className="h-3.5 w-3.5" />, color: "border-cyan-400/30 bg-cyan-500/5 text-cyan-200" },
          { label: "Unseen / new", value: String(unseen.length), icon: <Eye className="h-3.5 w-3.5" />, color: "border-amber-400/30 bg-amber-500/5 text-amber-300" },
          { label: "Last 24h", value: String(recent24h.length), icon: <Clock className="h-3.5 w-3.5" />, color: "" },
          { label: "News events", value: news ? news.totalIngested.toLocaleString() : "—", icon: <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />, color: "border-emerald-400/20 bg-emerald-500/5" },
          { label: "Last ingest", value: news?.lastRunAt ? timeAgo(news.lastRunAt) : "—", icon: <Zap className="h-3.5 w-3.5" />, color: "" },
          { label: "Shown now", value: String(allItems.length), icon: <Filter className="h-3.5 w-3.5" />, color: "" },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-lg border border-border/60 bg-card/40 px-3 py-2.5", s.color)}>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {s.icon} {s.label}
            </div>
            <div className="text-lg font-bold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + Export — ek hi section mein */}
      <div className="mb-4 rounded-xl border border-border/60 bg-card/30 px-4 py-3 space-y-3">

        {/* Row 1: Date filter + direct export for that date */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-12">Date</span>
          {DATE_OPTIONS.map((d) => (
            <button key={d.key} onClick={() => setDateFilter(d.key)}
              className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                dateFilter === d.key ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}>
              {d.label}
            </button>
          ))}
          {/* Export bar directly next to date filter */}
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Export:</span>
            <select value={exportSize} onChange={(e) => setExportSize(e.target.value)}
              className="rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground">
              {EXPORT_SIZE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {/* Primary: export current filtered view */}
            <Button size="sm" variant="default" onClick={() => csvExport(getExportItems(allItems), `${dateFilter}-${category}`)}
              disabled={allItems.length === 0}
              className="text-[11px] h-7 bg-primary hover:bg-primary/90">
              <Download className="mr-1 h-3 w-3" />
              Export current ({Math.min(allItems.length, exportSize === "all" ? 99999 : Number(exportSize))})
            </Button>
            {/* Secondary quick exports */}
            <Button size="sm" variant="outline" onClick={() => csvExport(getExportItems(diamonds), "diamonds")}
              disabled={diamonds.length === 0}
              className="border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10 text-[11px] h-7">
              💎 ({Math.min(diamonds.length, exportSize === "all" ? 99999 : Number(exportSize))})
            </Button>
            <Button size="sm" variant="outline" onClick={() => csvExport(getExportItems(unseen), "unseen")}
              disabled={unseen.length === 0}
              className="border-amber-400/40 text-amber-300 hover:bg-amber-500/10 text-[11px] h-7">
              <Eye className="mr-1 h-3 w-3" /> New ({Math.min(unseen.length, exportSize === "all" ? 99999 : Number(exportSize))})
            </Button>
          </div>
        </div>

        {/* Row 2: Category + smart toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-12">Filter</span>
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                category === c.key ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}>
              {c.label}
            </button>
          ))}
          <div className="ml-2 flex gap-1.5">
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
              💎 AI only
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading && allItems.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : allItems.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/30 py-24 text-center">
          <Gem className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold">No diamonds yet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            The hunter is scanning 24/7. LLM generates quality names from news/funding signals.
            First diamond alert will arrive on Telegram.
          </p>
          {unseenOnly && (
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setUnseenOnly(false)}>
              Show all (including seen)
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left w-8">#</th>
                <th className="px-3 py-3 text-left min-w-[200px]">Domain</th>
                <th className="px-3 py-3 text-center">AI Gate</th>
                <th className="px-3 py-3 text-left hidden lg:table-cell min-w-[180px]">AI Reason</th>
                <th className="px-3 py-3 text-center hidden md:table-cell">Category</th>
                <th className="px-3 py-3 text-right">Score</th>
                <th className="px-3 py-3 text-center hidden xl:table-cell">Letters</th>
                <th className="px-3 py-3 text-center hidden xl:table-cell">Found</th>
                <th className="px-3 py-3 text-right min-w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((d, i) => {
                const isSeen = !!d.viewedAt || !!seenMap[d.id];
                const isNew = !isSeen && Date.now() - new Date(d.discoveredAt).getTime() < 3600000;
                return (
                  <tr key={d.id}
                    className={cn(
                      "border-t border-border/40 transition-colors",
                      d.isDiamond ? "bg-gradient-to-r from-cyan-500/8 to-transparent hover:from-cyan-500/12" : "hover:bg-muted/10",
                      isSeen && "opacity-40",
                    )}>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums text-[11px]">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {d.isDiamond && <span title="AI diamond">💎</span>}
                        {isNew && !isSeen && (
                          <span className="text-[9px] font-bold uppercase bg-emerald-500 text-white rounded px-1 py-0.5">NEW</span>
                        )}
                        <span className={cn("font-mono font-semibold", d.isDiamond && "text-cyan-200")}>{d.fqdn}</span>
                        <CopyBtn text={d.fqdn} />
                      </div>
                      {isSeen && <span className="text-[9px] text-muted-foreground">✓ reviewed</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {d.diamondScore != null ? (
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                          d.isDiamond ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                          : d.diamondScore >= 50 ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                          : "border-border/40 text-muted-foreground"
                        )}>
                          <Shield className="h-2.5 w-2.5" /> {d.diamondScore}/100
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 italic">AI checking…</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className="text-[11px] text-muted-foreground line-clamp-1 max-w-[200px]" title={d.diamondReason ?? ""}>
                        {d.diamondReason ?? (d.isDiamond ? "News-trend AI pick" : "—")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden md:table-cell">
                      <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", CAT_COLOR[d.category])}>
                        {CAT_LABEL[d.category] ?? d.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn("font-bold tabular-nums",
                        d.valueScore >= 80 ? "text-emerald-300"
                        : d.valueScore >= 60 ? "text-amber-300"
                        : "text-muted-foreground"
                      )}>
                        {d.valueScore}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden xl:table-cell text-muted-foreground tabular-nums">{d.length}</td>
                    <td className="px-3 py-2.5 text-center hidden xl:table-cell text-[11px] text-muted-foreground">{timeAgo(d.discoveredAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => void toggleSeen(d)}
                          title={isSeen ? "Mark unseen" : "Mark as seen / reviewed"}
                          className="p-1.5 rounded border border-border/60 text-muted-foreground hover:text-foreground transition-colors">
                          {isSeen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <a href={`https://www.namecheap.com/domains/registration/results/?domain=${d.fqdn}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-0.5 rounded border border-emerald-400/40 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors">
                          NC <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        <a href={`https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${d.fqdn}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-0.5 rounded bg-primary/90 px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary transition-colors">
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
        Hunter scans 24/7 · GPT-4o-mini applies 50 quality factors BEFORE checking availability ·
        💎 Telegram alert sent immediately · Mark seen to separate reviewed · Export by category, date, or count
      </p>
    </div>
  );
}
