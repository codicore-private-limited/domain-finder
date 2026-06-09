import { useEffect, useMemo, useState } from "react";
import {
  Gem,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchDiscoveries, type Discovery } from "@/hooks/use-hunter-stream";

const CATEGORIES = [
  { key: "all", label: "All sectors" },
  { key: "ai", label: "AI" },
  { key: "quantum", label: "Quantum" },
  { key: "biotech", label: "Biotech" },
  { key: "green_energy", label: "Green Energy" },
  { key: "space_tech", label: "Space-Tech" },
];

const CATEGORY_COLOR: Record<string, string> = {
  ai: "border-violet-400/40 text-violet-200 bg-violet-500/10",
  quantum: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10",
  biotech: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  green_energy: "border-lime-400/40 text-lime-200 bg-lime-500/10",
  space_tech: "border-amber-400/40 text-amber-200 bg-amber-500/10",
};

const MIN_SCORE_OPTIONS = [
  { v: 0, label: "Any score" },
  { v: 60, label: "60+ score" },
  { v: 70, label: "70+ score" },
  { v: 80, label: "80+ score" },
  { v: 90, label: "90+ score" },
];

const LENGTH_OPTIONS = [
  { v: 0, label: "Any length" },
  { v: 5, label: "5 letters" },
  { v: 6, label: "6 letters" },
  { v: 7, label: "7 letters" },
];

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="shrink-0 rounded border border-border/60 p-1 text-muted-foreground hover:border-primary/40 hover:text-primary"
      title="Copy domain"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function FoundDomains() {
  const [items, setItems] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [length, setLength] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchDiscoveries({
        limit: 500,
        minScore,
        category,
        length: length || null,
      });
      // Sort by valueScore desc (highest quality first)
      const sorted = [...res.items].sort((a, b) => b.valueScore - a.valueScore);
      setItems(sorted);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, minScore, length]);

  const topScore = items[0]?.valueScore ?? 0;
  const avgScore = useMemo(
    () => (items.length ? Math.round(items.reduce((s, d) => s + d.valueScore, 0) / items.length) : 0),
    [items],
  );

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Gem className="h-5 w-5 text-primary" />
            Found Domains
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every available .com the hunter found — ranked by quality score, highest first.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Shown</div>
          <div className="mt-1 text-2xl font-bold">{items.length}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top score</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">{topScore}/100</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg score</div>
          <div className="mt-1 text-2xl font-bold">{avgScore}/100</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sorted by</div>
          <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-primary">
            <TrendingUp className="h-4 w-4" /> Quality score
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-4 py-3">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </span>
        <Filter label="Min score" value={minScore} setValue={setMinScore} options={MIN_SCORE_OPTIONS} />
        <Filter label="Length" value={length} setValue={setLength} options={LENGTH_OPTIONS} />
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                category === c.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading && items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading domains…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-card/30 py-16 text-center">
          <h3 className="text-base font-semibold">No domains at this filter</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Lower the min score, or let the hunter run longer to find more.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Domain</th>
                <th className="px-3 py-2 text-center">Category</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-center">Len</th>
                <th className="px-3 py-2 text-center">Radio</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => {
                const godaddy = `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.fqdn)}`;
                return (
                  <tr key={d.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{d.fqdn}</span>
                        <CopyBtn text={d.fqdn} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", CATEGORY_COLOR[d.category])}>
                        {d.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn(
                        "font-semibold tabular-nums",
                        d.valueScore >= 80 ? "text-emerald-300" : d.valueScore >= 60 ? "text-amber-300" : "text-muted-foreground",
                      )}>
                        {d.valueScore}
                      </span>
                      <span className="text-[10px] text-muted-foreground">/100</span>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">{d.length}</td>
                    <td className="px-3 py-2 text-center">
                      {d.radioTest ? (
                        <span className="text-[10px] text-emerald-400">✓ pass</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={godaddy}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary"
                      >
                        Register <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  options: { v: number; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="rounded border border-border/60 bg-background px-2 py-1 text-[12px] text-foreground"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
