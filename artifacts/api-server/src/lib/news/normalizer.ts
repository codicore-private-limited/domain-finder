import type { RawNewsItem } from "./sources";

// Map of category -> trigger words. Used to assign news items to deep-tech buckets.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ai: [
    "ai", "artificial intelligence", "agent", "agentic", "llm", "gpt", "claude",
    "gemini", "copilot", "cursor", "openai", "anthropic", "mistral", "groq",
    "neural", "transformer", "inference", "rag", "diffusion", "embedding",
    "fine-tune", "foundation model", "multimodal", "reasoning", "synthetic",
  ],
  quantum: [
    "quantum", "qubit", "qpu", "entangle", "superpos", "ibm quantum",
    "google quantum", "rigetti", "ionq", "photonic",
  ],
  biotech: [
    "biotech", "crispr", "gene", "genome", "mrna", "vaccine", "therapy",
    "synthetic biology", "longevity", "neuralink", "bci", "protein", "alphafold",
  ],
  green_energy: [
    "battery", "solar", "ev ", "electric vehicle", "wind", "hydrogen",
    "fusion", "nuclear", "grid", "carbon capture", "renewable", "lithium",
  ],
  space_tech: [
    "spacex", "starship", "satellite", "lunar", "mars", "rocket",
    "blue origin", "rocket lab", "orbit", "starlink", "space station",
  ],
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "has",
  "will", "would", "could", "should", "their", "they", "them", "what",
  "when", "where", "which", "who", "why", "how", "are", "was", "were",
  "been", "being", "but", "not", "you", "your", "all", "any", "can",
  "out", "new", "now", "one", "two", "say", "says", "said", "get",
  "got", "make", "made", "into", "over", "under", "after", "before",
  "more", "most", "less", "least", "very", "much", "many", "few",
  "also", "just", "only", "than", "then", "there", "here", "such",
  "some", "any", "every", "each", "other", "another", "about", "above",
  "below", "down", "off", "on", "in", "at", "to", "of", "by",
  "as", "is", "it", "its", "be", "or", "if", "an", "a",
  // Feed / HTML / boilerplate noise that leaks from RSS descriptions.
  "nbsp", "amp", "quot", "apos", "href", "https", "http", "www", "com",
  "active", "generic", "ingredient", "ingredients", "exclusive", "reuters",
  "read", "more", "full", "story", "click", "via", "ago", "report",
]);

function classifyCategories(title: string, summary: string | null): string[] {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  const out: string[] = [];
  for (const [cat, triggers] of Object.entries(CATEGORY_KEYWORDS)) {
    if (triggers.some((t) => text.includes(t))) out.push(cat);
  }
  return out;
}

function extractKeywords(title: string, summary: string | null): string[] {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  const tokens = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && t.length <= 12 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);
}

/**
 * Source trust weights. Higher = more authoritative for commercial signals.
 */
const SOURCE_TRUST: Record<string, number> = {
  hackernews: 0.85,
  "reddit:technology": 0.65,
  "reddit:artificial": 0.7,
  "reddit:MachineLearning": 0.75,
  "reddit:startups": 0.7,
  "reddit:biotech": 0.7,
  "reddit:space": 0.65,
  // Authoritative primary sources: research, regulatory and funding journalism.
  arxiv: 0.9,
  fda: 0.92,
  techcrunch: 0.8,
  googlenews: 0.7,
};

function trustOf(source: string): number {
  return SOURCE_TRUST[source] ?? 0.5;
}

function engagementBoost(source: string, metadata: Record<string, unknown>): number {
  if (source === "hackernews") {
    const points = Number(metadata.points ?? 0);
    const comments = Number(metadata.comments ?? 0);
    // 200+ points or 100+ comments = significant story.
    return Math.min(1, (points / 300) * 0.6 + (comments / 200) * 0.4);
  }
  if (source.startsWith("reddit:")) {
    const score = Number(metadata.score ?? 0);
    const comments = Number(metadata.comments ?? 0);
    return Math.min(1, (score / 1000) * 0.6 + (comments / 300) * 0.4);
  }
  // Primary sources carry no engagement metrics; give them a solid baseline so
  // their high trust weight isn't washed out.
  if (source === "fda") return 0.8;
  if (source === "arxiv") return 0.6;
  if (source === "techcrunch" || source === "googlenews") return 0.5;
  return 0.3;
}

function recencyBoost(publishedAt: Date): number {
  const hours = (Date.now() - publishedAt.getTime()) / 3_600_000;
  if (hours < 1) return 1;
  if (hours < 6) return 0.85;
  if (hours < 24) return 0.65;
  if (hours < 72) return 0.4;
  return 0.15;
}

export interface NormalizedEvent {
  dedupeKey: string;
  source: string;
  sourceId: string;
  title: string;
  summary: string | null;
  url: string | null;
  categories: string[];
  keywords: string[];
  impactScore: number;
  metadata: Record<string, unknown>;
  publishedAt: Date;
}

function dedupeKeyFor(item: RawNewsItem): string {
  // Stable hash using source + normalized title (first 80 chars).
  const normTitle = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  return `${item.source}|${normTitle}`;
}

export function normalizeEvent(item: RawNewsItem): NormalizedEvent | null {
  const categories = classifyCategories(item.title, item.summary);
  // Skip events that don't touch any of our deep-tech buckets.
  if (categories.length === 0) return null;

  const keywords = extractKeywords(item.title, item.summary);
  if (keywords.length === 0) return null;

  const trust = trustOf(item.source);
  const engagement = engagementBoost(item.source, item.metadata);
  const recency = recencyBoost(item.publishedAt);
  // Weighted impact score 0..100.
  const raw = trust * 0.3 + engagement * 0.4 + recency * 0.3;
  const impactScore = Math.round(raw * 100 * 10) / 10;

  return {
    dedupeKey: dedupeKeyFor(item),
    source: item.source,
    sourceId: item.sourceId,
    title: item.title,
    summary: item.summary,
    url: item.url,
    categories,
    keywords,
    impactScore,
    metadata: item.metadata,
    publishedAt: item.publishedAt,
  };
}

export function normalizeBatch(items: RawNewsItem[]): NormalizedEvent[] {
  const seen = new Set<string>();
  const out: NormalizedEvent[] = [];
  for (const item of items) {
    const norm = normalizeEvent(item);
    if (!norm) continue;
    if (seen.has(norm.dedupeKey)) continue;
    seen.add(norm.dedupeKey);
    out.push(norm);
  }
  return out;
}
