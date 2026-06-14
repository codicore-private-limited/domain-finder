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

/**
 * Curated high-value commercial concept phrases. When one of these appears in a
 * headline it is a strong, commercially-meaningful domain seed — far better than
 * a single frequent token. Used to (a) prioritise phrase keyword extraction and
 * (b) boost category relevance in the impact score. This is a TREND/RADAR signal
 * only; the final diamond decision still happens in the strict domain evaluator.
 */
const HIGH_VALUE_PHRASES: string[] = [
  // AI / software / infra
  "ai agent", "ai agents", "agentic ai", "autonomous agent", "ai infrastructure",
  "ai model", "ai models", "foundation model", "language model", "image model",
  "video model", "world model", "reasoning model", "inference engine", "voice ai",
  "vision model", "multimodal model", "ai chip", "ai chips", "ai accelerator",
  "edge ai", "ai search", "code generation", "developer tools", "developer workflow",
  "workflow automation", "data pipeline", "data infrastructure", "cloud security",
  "data security", "identity verification", "fraud detection", "robot vision",
  "humanoid robot", "machine vision",
  // biotech / health
  "gene therapy", "cell therapy", "drug discovery", "synthetic biology",
  "protein design", "cancer vaccine", "brain implant", "weight loss",
  // green energy
  "fusion energy", "fusion battery", "nuclear fusion", "solid state",
  "solid state battery", "carbon capture", "clean energy", "grid storage",
  // quantum / space
  "quantum chip", "quantum computing", "quantum processor", "error correction",
  "space station", "satellite internet", "lunar lander", "reusable rocket",
];
const HIGH_VALUE_PHRASE_SET = new Set(HIGH_VALUE_PHRASES);

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
  // News / funding boilerplate. These are NOT useful domain seeds — they are
  // the journalistic scaffolding around the actual trend. (News keyword
  // extraction only; domain wordlists are untouched.)
  "raise", "raises", "raised", "raising", "funding", "funded", "million",
  "billion", "series", "round", "seed", "capital", "venture", "ventures",
  "investor", "investors", "startup", "startups", "company", "companies",
  "firm", "firms", "launch", "launches", "launched", "announce", "announces",
  "announced", "reports", "reported", "according", "source", "sources",
  "show", "shows", "reveal", "reveals", "revealed", "plan", "plans",
  "technology", "platform", "solution", "solutions",
]);

function classifyCategories(title: string, summary: string | null): string[] {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  const out: string[] = [];
  for (const [cat, triggers] of Object.entries(CATEGORY_KEYWORDS)) {
    if (triggers.some((t) => text.includes(t))) out.push(cat);
  }
  return out;
}

function isContentToken(t: string, minLen: number): boolean {
  return (
    t.length >= minLen &&
    t.length <= 18 &&
    !STOPWORDS.has(t) &&
    !/^\d+$/.test(t)
  );
}

/**
 * Extract commercially-meaningful keywords from a headline.
 *
 * Returns a mix of:
 *  1. recognised high-value concept phrases (e.g. "ai agent", "gene therapy"),
 *  2. distinctive 2-word concept phrases where BOTH halves are content words,
 *  3. single content words (kept for the UI / as a fallback).
 *
 * Phrases rank ahead of single tokens so we surface "cloud security" or
 * "workflow automation" instead of leaking generic boilerplate like "raises".
 */
function extractKeywords(title: string, summary: string | null): string[] {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  const tokens = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  // 1) Known high-value phrases present verbatim in the text (top priority).
  const phraseHits: string[] = [];
  for (const phrase of HIGH_VALUE_PHRASES) {
    if (text.includes(phrase)) phraseHits.push(phrase);
  }

  // 2) Generic 2-word concept phrases: both tokens must be content words.
  //    A short token (e.g. "ai") is allowed as a bigram half so we don't lose
  //    "ai agent" / "voice ai", but stopwords/digits are excluded both sides.
  const bigramFreq = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (a === b) continue;
    if (!isContentToken(a, 2) || !isContentToken(b, 2)) continue;
    // Require at least one half to carry real length so we skip "ev ai"-type noise.
    if (a.length < 3 && b.length < 3) continue;
    const bigram = `${a} ${b}`;
    bigramFreq.set(bigram, (bigramFreq.get(bigram) ?? 0) + 1);
  }

  // 3) Single content words (>=4 chars to keep the UI clean).
  const wordFreq = new Map<string, number>();
  for (const t of tokens) {
    if (!isContentToken(t, 4)) continue;
    wordFreq.set(t, (wordFreq.get(t) ?? 0) + 1);
  }

  const rankedBigrams = Array.from(bigramFreq.entries())
    .sort((a, b) => {
      // Curated high-value phrases first, then by frequency.
      const av = HIGH_VALUE_PHRASE_SET.has(a[0]) ? 1 : 0;
      const bv = HIGH_VALUE_PHRASE_SET.has(b[0]) ? 1 : 0;
      if (av !== bv) return bv - av;
      return b[1] - a[1];
    })
    .map(([k]) => k);

  const rankedWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => {
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  for (const p of phraseHits) add(p);
  for (const b of rankedBigrams) add(b);
  for (const w of rankedWords) add(w);
  return out.slice(0, 12);
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

const FUNDING_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

/** Largest money amount (USD-ish) mentioned in the text, or 0. */
function detectFundingUsd(text: string): number {
  const re = /[$€£]?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|mn|million|b|bn|billion)\b/gi;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1] ?? "0");
    const mult = FUNDING_MULTIPLIERS[(m[2] ?? "").toLowerCase()] ?? 1;
    const amount = value * mult;
    if (amount > max) max = amount;
  }
  return max;
}

/**
 * Funding signal 0..1. Only fires when there is an actual money symbol ($X M/B)
 * or explicit funding context, so "5 million users" does not count as funding.
 */
function fundingSignal(text: string): number {
  const hasMoney = /[$€£]\s*\d/.test(text);
  const hasContext =
    /\b(raise|raises|raised|raising|funding|funded|round|investment|valuation|series\s+[a-e]\b|seed round|backed by)\b/.test(
      text,
    );
  if (!hasMoney && !hasContext) return 0;
  const amount = detectFundingUsd(text);
  if (amount >= 1_000_000_000) return 1;
  if (amount >= 500_000_000) return 0.9;
  if (amount >= 100_000_000) return 0.8;
  if (amount >= 50_000_000) return 0.65;
  if (amount >= 10_000_000) return 0.5;
  if (amount >= 1_000_000) return 0.35;
  return hasContext ? 0.2 : 0;
}

/**
 * Category relevance 0..1. Rewards events that clearly sit in a deep-tech bucket
 * and — especially — those that contain a recognised high-value concept phrase.
 */
function categoryRelevanceSignal(text: string, categories: string[]): number {
  let score = Math.min(0.6, categories.length * 0.3);
  if (HIGH_VALUE_PHRASES.some((p) => text.includes(p))) {
    score = Math.max(0.7, Math.min(1, score + 0.4));
  }
  return score;
}

const BREAKTHROUGH_WORDS = [
  "breakthrough", "world first", "first ever", "approval", "approved",
  "clearance", "cleared", "clinical trial", "phase 3", "phase iii",
  "fda approval", "patent", "milestone", "record", "novel", "unveil",
  "demonstrate", "discovery", "passes",
];

/**
 * Breakthrough / regulatory / research signal 0..1. FDA (regulatory) and ArXiv
 * (primary research) get strong fixed values so they never depend on engagement.
 */
function breakthroughSignal(source: string, text: string): number {
  if (source === "fda") return 1;
  if (source === "arxiv") return 0.8;
  let hits = 0;
  for (const w of BREAKTHROUGH_WORDS) if (text.includes(w)) hits++;
  return Math.min(1, hits * 0.4);
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

  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const trust = trustOf(item.source);
  const engagement = engagementBoost(item.source, item.metadata);
  const recency = recencyBoost(item.publishedAt);
  const categoryRel = categoryRelevanceSignal(text, categories);
  const funding = fundingSignal(text);
  const breakthrough = breakthroughSignal(item.source, text);

  // Source-aware factor model. Each factor is 0..1; weights sum to 100. Recency
  // is deliberately a minority weight so a fresh-but-empty post can't dominate.
  let impact =
    trust * 25 +
    engagement * 25 +
    recency * 15 +
    categoryRel * 15 +
    funding * 10 +
    breakthrough * 10;

  // Guard: a freshly-submitted HN "latest" post with zero points AND zero
  // comments must not ride high on recency alone. Allow an escape hatch only if
  // it carries a strong category or funding signal in the headline itself.
  if (item.source === "hackernews" && item.metadata.feed === "latest") {
    const points = Number(item.metadata.points ?? 0);
    const comments = Number(item.metadata.comments ?? 0);
    const strongSignal = funding >= 0.5 || categoryRel >= 0.7;
    if (points === 0 && comments === 0 && !strongSignal) {
      impact = Math.min(impact, 45);
    }
  }

  const impactScore = Math.round(Math.max(0, Math.min(100, impact)) * 10) / 10;

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
