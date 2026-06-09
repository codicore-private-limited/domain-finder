import { logger } from "../logger";

export interface RawNewsItem {
  source: string;
  sourceId: string;
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: Date;
  // Engagement signals from upstream platform (points, comments, score, etc.).
  metadata: Record<string, unknown>;
}

const HN_TOP = "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=50";
const REDDIT_FEEDS = [
  "https://www.reddit.com/r/technology/top.json?t=day&limit=40",
  "https://www.reddit.com/r/artificial/top.json?t=day&limit=40",
  "https://www.reddit.com/r/MachineLearning/top.json?t=day&limit=30",
  "https://www.reddit.com/r/startups/top.json?t=day&limit=30",
  "https://www.reddit.com/r/biotech/top.json?t=day&limit=20",
  "https://www.reddit.com/r/space/top.json?t=day&limit=20",
];

interface HnHit {
  objectID: string;
  title?: string | null;
  story_text?: string | null;
  url?: string | null;
  created_at: string;
  points?: number | null;
  num_comments?: number | null;
  author?: string | null;
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext?: string;
    url?: string;
    permalink: string;
    created_utc: number;
    score: number;
    num_comments: number;
    subreddit: string;
    author: string;
  };
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "domain-finder-news-ingest/1.0 (+https://github.com/rishi9520/domain-finder)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, "news source non-OK");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.debug({ url, err }, "news source fetch failed");
    return null;
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "domain-finder-news-ingest/1.0 (+https://github.com/rishi9520/domain-finder)",
        Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, "news source non-OK (text)");
      return null;
    }
    return await res.text();
  } catch (err) {
    logger.debug({ url, err }, "news source fetch failed (text)");
    return null;
  }
}

// Minimal entity decoder for the handful of entities that show up in feeds.
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ") // strip any leftover HTML tags
    .replace(/\s+/g, " ")
    .trim();
}

// Extract the inner text of the first matching tag within a block.
function tagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1] ?? "") : null;
}

// Extract an attribute value (e.g. <link href="..."/>).
function tagAttr(block: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1] ?? "") : null;
}

// Split a feed into per-item blocks for either RSS (<item>) or Atom (<entry>).
function splitItems(xml: string): string[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  if (items && items.length > 0) return items;
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi);
  return entries ?? [];
}

function parseDate(s: string | null): Date {
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function fetchHackerNews(): Promise<RawNewsItem[]> {
  const json = await fetchJson<{ hits: HnHit[] }>(HN_TOP);
  if (!json?.hits) return [];
  return json.hits
    .filter((h) => h.title && h.title.trim().length > 0)
    .map((h) => ({
      source: "hackernews",
      sourceId: h.objectID,
      title: h.title!,
      summary: h.story_text ?? null,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      publishedAt: new Date(h.created_at),
      metadata: {
        points: h.points ?? 0,
        comments: h.num_comments ?? 0,
        author: h.author ?? null,
      },
    }));
}

export async function fetchReddit(): Promise<RawNewsItem[]> {
  const out: RawNewsItem[] = [];
  for (const feed of REDDIT_FEEDS) {
    const json = await fetchJson<{ data?: { children?: RedditPost[] } }>(feed);
    const posts = json?.data?.children ?? [];
    for (const p of posts) {
      const d = p.data;
      if (!d.title) continue;
      out.push({
        source: `reddit:${d.subreddit}`,
        sourceId: d.id,
        title: d.title,
        summary: d.selftext && d.selftext.length < 1500 ? d.selftext : null,
        url: d.url ?? `https://www.reddit.com${d.permalink}`,
        publishedAt: new Date(d.created_utc * 1000),
        metadata: {
          score: d.score,
          comments: d.num_comments,
          author: d.author,
          subreddit: d.subreddit,
        },
      });
    }
  }
  return out;
}

// ArXiv: cutting-edge research before it hits mainstream news. Free, no key.
// We pull the newest submissions across AI, quantum, biotech and related cats.
const ARXIV_URL =
  "http://export.arxiv.org/api/query?search_query=" +
  encodeURIComponent("cat:cs.AI OR cat:cs.LG OR cat:quant-ph OR cat:q-bio.GN OR cat:cs.RO") +
  "&sortBy=submittedDate&sortOrder=descending&max_results=40";

export async function fetchArxiv(): Promise<RawNewsItem[]> {
  const xml = await fetchText(ARXIV_URL, 10000);
  if (!xml) return [];
  const out: RawNewsItem[] = [];
  for (const block of splitItems(xml)) {
    const title = tagText(block, "title");
    if (!title || title.trim().length === 0) continue;
    const id = tagAttr(block, "id", "href") ?? tagText(block, "id");
    const summary = tagText(block, "summary");
    out.push({
      source: "arxiv",
      sourceId: id ?? title,
      title: title.trim(),
      summary: summary ? summary.slice(0, 1500) : null,
      url: id ?? null,
      publishedAt: parseDate(tagText(block, "published")),
      metadata: { kind: "research" },
    });
  }
  return out;
}

// Google News RSS: real-time funding / breakthrough headlines. Free, no key.
const GOOGLE_NEWS_QUERIES = [
  "startup raises million funding",
  "series A funding breakthrough technology",
  "biotech FDA approval breakthrough",
  "fusion energy hydrogen battery breakthrough",
];

function googleNewsUrl(query: string): string {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-US&gl=US&ceid=US:en"
  );
}

export async function fetchGoogleNews(): Promise<RawNewsItem[]> {
  const out: RawNewsItem[] = [];
  for (const q of GOOGLE_NEWS_QUERIES) {
    const xml = await fetchText(googleNewsUrl(q), 9000);
    if (!xml) continue;
    for (const block of splitItems(xml)) {
      const title = tagText(block, "title");
      if (!title || title.trim().length === 0) continue;
      const link = tagText(block, "link") ?? tagAttr(block, "link", "href");
      const guid = tagText(block, "guid") ?? link ?? title;
      out.push({
        source: "googlenews",
        sourceId: guid,
        title: title.trim(),
        summary: tagText(block, "description"),
        url: link ?? null,
        publishedAt: parseDate(tagText(block, "pubDate")),
        metadata: { query: q },
      });
    }
  }
  return out;
}

// openFDA drug approvals: generic pharma names (the legal, brandable gold).
// Free, no key required for modest volumes.
const FDA_URL =
  "https://api.fda.gov/drug/drugsfda.json?sort=submissions.submission_status_date:desc&limit=30";

interface FdaResult {
  openfda?: { brand_name?: string[]; generic_name?: string[] };
  products?: {
    brand_name?: string;
    active_ingredients?: { name?: string }[];
  }[];
  application_number?: string;
}

export async function fetchFda(): Promise<RawNewsItem[]> {
  const json = await fetchJson<{ results?: FdaResult[] }>(FDA_URL, 10000);
  if (!json?.results) return [];
  const out: RawNewsItem[] = [];
  for (const r of json.results) {
    const brand =
      r.products?.[0]?.brand_name ?? r.openfda?.brand_name?.[0] ?? null;
    const generic =
      r.openfda?.generic_name?.[0] ??
      r.products?.[0]?.active_ingredients?.[0]?.name ??
      null;
    if (!brand && !generic) continue;
    const title = [brand, generic].filter(Boolean).join(" — ");
    out.push({
      source: "fda",
      sourceId: r.application_number ?? title,
      title: `FDA: ${title}`,
      summary: generic ?? null,
      url: r.application_number
        ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${encodeURIComponent(
            r.application_number.replace(/^\D+/, ""),
          )}`
        : null,
      publishedAt: new Date(),
      metadata: { kind: "pharma", brand, generic },
    });
  }
  return out;
}

// TechCrunch RSS: startup / funding journalism. Free, no key.
const TECHCRUNCH_URL = "https://techcrunch.com/feed/";

export async function fetchTechCrunch(): Promise<RawNewsItem[]> {
  const xml = await fetchText(TECHCRUNCH_URL, 9000);
  if (!xml) return [];
  const out: RawNewsItem[] = [];
  for (const block of splitItems(xml)) {
    const title = tagText(block, "title");
    if (!title || title.trim().length === 0) continue;
    const link = tagText(block, "link") ?? tagAttr(block, "link", "href");
    const guid = tagText(block, "guid") ?? link ?? title;
    out.push({
      source: "techcrunch",
      sourceId: guid,
      title: title.trim(),
      summary: tagText(block, "description"),
      url: link ?? null,
      publishedAt: parseDate(tagText(block, "pubDate")),
      metadata: { kind: "journalism" },
    });
  }
  return out;
}

export async function fetchAllSources(): Promise<RawNewsItem[]> {
  const [hn, reddit, arxiv, googleNews, fda, techcrunch] = await Promise.all([
    fetchHackerNews().catch(() => []),
    fetchReddit().catch(() => []),
    fetchArxiv().catch(() => []),
    fetchGoogleNews().catch(() => []),
    fetchFda().catch(() => []),
    fetchTechCrunch().catch(() => []),
  ]);
  return [...hn, ...reddit, ...arxiv, ...googleNews, ...fda, ...techcrunch];
}
