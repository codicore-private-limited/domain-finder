import { logger } from "./logger";
import { chatJSON, llmAvailable } from "./llm";

const STATIC_FALLBACK: Record<
  string,
  { keywords: { keyword: string; weight: number; rationale: string }[]; suffixes: string[]; prefixes: string[] }
> = {
  ai: {
    keywords: [
      { keyword: "neural", weight: 0.95, rationale: "Core AI architecture term — broadly recognized." },
      { keyword: "agent", weight: 0.92, rationale: "Autonomous AI agents are the dominant 2026 narrative." },
      { keyword: "synth", weight: 0.85, rationale: "Synthetic data and synthetic intelligence framings." },
      { keyword: "infer", weight: 0.78, rationale: "Inference-time compute is the new scaling axis." },
      { keyword: "axion", weight: 0.7, rationale: "Coined feel — adjacent to axon, distinct, brandable." },
    ],
    suffixes: ["mind", "sync", "core", "logic", "vertex", "nexus"],
    prefixes: ["neural", "cog", "synap", "deep", "axion"],
  },
  quantum: {
    keywords: [
      { keyword: "qubit", weight: 0.96, rationale: "Foundational unit of quantum computing." },
      { keyword: "entangle", weight: 0.85, rationale: "Quantum entanglement — high-recognition concept." },
      { keyword: "wave", weight: 0.78, rationale: "Wavefunction language is mainstream now." },
      { keyword: "fluxon", weight: 0.7, rationale: "Quasi-particle naming, brandable and rare." },
      { keyword: "vertex", weight: 0.68, rationale: "Crossover term used in lattice quantum hardware." },
    ],
    suffixes: ["qbit", "qore", "wave", "node", "grid", "vertex"],
    prefixes: ["qore", "qubo", "entangl", "wave", "axiq"],
  },
  biotech: {
    keywords: [
      { keyword: "gene", weight: 0.94, rationale: "CRISPR/gene editing remains the public-facing biotech wedge." },
      { keyword: "helix", weight: 0.88, rationale: "Iconic, recognizable, broadly evocative of DNA." },
      { keyword: "cyto", weight: 0.78, rationale: "Cellular-prefix branding is gaining adoption." },
      { keyword: "myco", weight: 0.7, rationale: "Mycelium / fungi-tech is a fast-growing subdomain." },
      { keyword: "neuro", weight: 0.82, rationale: "Brain-machine interface is mainstream after Neuralink." },
    ],
    suffixes: ["bio", "gene", "cell", "vita", "lyte", "zoa"],
    prefixes: ["geno", "cyto", "helix", "nucl", "myco"],
  },
  green_energy: {
    keywords: [
      { keyword: "volt", weight: 0.93, rationale: "Universal energy term — instant recognition." },
      { keyword: "flux", weight: 0.84, rationale: "Powerful electrical/magnetic connotation." },
      { keyword: "verd", weight: 0.78, rationale: "Latin 'green' root, premium feel for sustainability brands." },
      { keyword: "lume", weight: 0.72, rationale: "Luminous + light-energy adjacency." },
      { keyword: "kine", weight: 0.7, rationale: "Kinetic energy framing for motion-based generation." },
    ],
    suffixes: ["volt", "grid", "pulse", "flux", "solr", "leaf"],
    prefixes: ["eco", "verd", "lume", "sol", "kine"],
  },
  space_tech: {
    keywords: [
      { keyword: "orbit", weight: 0.95, rationale: "Foundational, instantly understood by everyone." },
      { keyword: "nova", weight: 0.9, rationale: "Stellar branding term — evokes power and birth." },
      { keyword: "warp", weight: 0.82, rationale: "Sci-fi adjacent, ambitious, memorable." },
      { keyword: "exo", weight: 0.75, rationale: "Exoplanet/exocraft framing for next-gen space." },
      { keyword: "stellr", weight: 0.7, rationale: "Coined drop-the-vowel branding feel." },
    ],
    suffixes: ["orbit", "warp", "nova", "quasr", "comet", "stellr"],
    prefixes: ["astra", "orbi", "nebu", "lumen", "exo"],
  },
};

export interface TrendBundleData {
  keywords: { keyword: string; weight: number; rationale: string }[];
  suffixes: string[];
  prefixes: string[];
}

export async function generateTrendsForCategory(
  category: string,
): Promise<TrendBundleData> {
  if (!llmAvailable()) {
    logger.warn("No LLM provider configured, returning curated fallback trends");
    return STATIC_FALLBACK[category] ?? STATIC_FALLBACK.ai!;
  }

  const prompt = `You are a deep-tech domain investment analyst. For the category "${category}", produce a JSON object with three arrays:

1. "keywords": 8 trending technical or conceptual keywords for this domain in 2026. Each item: { "keyword": <single short word, lowercase, 3-7 letters, no spaces, no hyphens>, "weight": <number 0..1 indicating trend strength>, "rationale": <one short sentence why this matters in 2026> }.
2. "suffixes": 8 short brandable suffixes (3-6 letters, lowercase, no hyphens, evocative of this category).
3. "prefixes": 6 short brandable prefixes (3-6 letters, lowercase, no hyphens, evocative of this category).

Return ONLY valid JSON, no prose, no markdown fences. Schema:
{ "keywords": [...], "suffixes": [...], "prefixes": [...] }`;

  try {
    const parsed = await chatJSON<TrendBundleData>(
      [
        { role: "system", content: "You output strictly valid JSON." },
        { role: "user", content: prompt },
      ],
      { temperature: 0.8, timeoutMs: 15000 },
    );

    if (!parsed) return STATIC_FALLBACK[category] ?? STATIC_FALLBACK.ai!;

    const keywords = (parsed.keywords ?? [])
      .filter(
        (k) =>
          k && typeof k.keyword === "string" && /^[a-z]{3,8}$/.test(k.keyword),
      )
      .slice(0, 8)
      .map((k) => ({
        keyword: k.keyword.toLowerCase(),
        weight: Math.max(0, Math.min(1, Number(k.weight) || 0.5)),
        rationale: String(k.rationale ?? "").slice(0, 200),
      }));

    const suffixes = (parsed.suffixes ?? [])
      .filter((s) => typeof s === "string" && /^[a-z]{2,7}$/.test(s))
      .map((s) => s.toLowerCase())
      .slice(0, 8);

    const prefixes = (parsed.prefixes ?? [])
      .filter((s) => typeof s === "string" && /^[a-z]{2,7}$/.test(s))
      .map((s) => s.toLowerCase())
      .slice(0, 6);

    if (keywords.length === 0) {
      return STATIC_FALLBACK[category] ?? STATIC_FALLBACK.ai!;
    }

    return {
      keywords,
      suffixes:
        suffixes.length > 0
          ? suffixes
          : (STATIC_FALLBACK[category] ?? STATIC_FALLBACK.ai!).suffixes,
      prefixes:
        prefixes.length > 0
          ? prefixes
          : (STATIC_FALLBACK[category] ?? STATIC_FALLBACK.ai!).prefixes,
    };
  } catch (err) {
    logger.warn({ err }, "LLM trend generation failed, using fallback");
    return STATIC_FALLBACK[category] ?? STATIC_FALLBACK.ai!;
  }
}

export interface RationaleInput {
  name: string;
  tld: string;
  category: string;
  strategy: string;
  pattern: string;
  valueScore: number;
}

export function buildRationale(input: RationaleInput): string {
  const { name, tld, category, strategy, pattern, valueScore } = input;
  const tier =
    valueScore >= 90
      ? "elite"
      : valueScore >= 75
        ? "strong"
        : valueScore >= 60
          ? "solid"
          : "speculative";
  const stratLabel: Record<string, string> = {
    brandable_cvcv: "phonetic brandable",
    future_suffix: "future-tech suffix blend",
    dictionary_hack: "trend-keyword fusion",
    transliteration: "cross-language root",
    four_letter: "four-letter exhaustive",
  };
  const catLabel: Record<string, string> = {
    ai: "AI",
    quantum: "quantum",
    biotech: "biotech",
    green_energy: "green-energy",
    space_tech: "space-tech",
  };
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1)} ${stratLabel[strategy] ?? strategy} pick for ${catLabel[category] ?? category}. ${name}.${tld} reads as ${pattern}, scoring well on length and pronounceability.`;
}
