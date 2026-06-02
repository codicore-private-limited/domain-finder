/**
 * Curated real-English word lists for 2-word meaningful domain generation.
 *
 * Design principles:
 * - Every word is a REAL, commonly recognized English word
 * - Words are 2-6 letters max (keeps total domain ≤ 12 chars)
 * - Words are categorized by semantic function (adj, verb, noun, tech, etc.)
 * - No obscure/archaic words — must pass the "would my mom recognize this?" test
 */

// ─────────────────────────────────────────────
// WORD1 (first word): Adjectives, verbs, descriptors
// These go first in the domain: {word1}{word2}.com
// ─────────────────────────────────────────────

/** Short adjectives (2-5 letters) — highest value as W1 */
export const ADJ_SHORT = [
  "ace", "apt", "big", "bold", "cool", "calm", "clear",
  "cold", "core", "crisp", "cut", "dark", "dear", "deep",
  "dry", "due", "easy", "edge", "fair", "far", "fast",
  "fine", "firm", "fit", "flat", "free", "full", "glad",
  "gold", "good", "gray", "half", "hard", "high", "hot",
  "keen", "key", "kind", "last", "lean", "live", "long",
  "loud", "low", "main", "mass", "max", "mild", "mint",
  "neat", "net", "new", "next", "nice", "odd", "old",
  "one", "only", "open", "own", "pale", "past", "peak",
  "pink", "plain", "plus", "pro", "pure", "quick", "rare",
  "raw", "real", "red", "rich", "ripe", "safe", "set",
  "sharp", "slim", "slow", "smart", "soft", "solo", "sure",
  "swift", "tall", "thin", "tiny", "top", "true", "vast",
  "warm", "wide", "wild", "wise", "zero",
];

/** Short action verbs (2-5 letters) — strong as W1 */
export const VERB_SHORT = [
  "ask", "bid", "bite", "blow", "book", "boost", "box",
  "build", "burn", "buy", "call", "care", "cast", "chat",
  "chip", "chop", "cite", "claim", "clip", "code", "cook",
  "copy", "crew", "crop", "crush", "cure", "cut", "dash",
  "deal", "dial", "dig", "dock", "dose", "draw", "drop",
  "earn", "edit", "face", "feed", "fill", "find", "fire",
  "fix", "flip", "flow", "fly", "fold", "form", "fuel",
  "gain", "gift", "give", "go", "grab", "grip", "grow",
  "hack", "halt", "haul", "heal", "help", "hide", "hint",
  "hire", "hit", "hold", "hook", "host", "hunt", "jack",
  "join", "jump", "just", "keen", "keep", "kick", "knit",
  "land", "lead", "lean", "leap", "lift", "like", "link",
  "list", "load", "lock", "log", "loop", "made", "mail",
  "make", "map", "mark", "match", "meet", "meld", "mend",
  "merge", "mind", "mint", "mix", "mode", "move", "mute",
  "nail", "note", "pack", "pair", "park", "pass", "path",
  "pay", "peek", "pick", "ping", "plan", "play", "plot",
  "plug", "poll", "post", "pour", "prep", "pull", "pump",
  "push", "quiz", "race", "rank", "rate", "read", "rent",
  "rest", "ride", "ring", "rise", "roll", "rule", "run",
  "rush", "save", "scan", "seal", "seed", "seek", "sell",
  "send", "set", "ship", "shop", "show", "sign", "sink",
  "skip", "snap", "sort", "spin", "spot", "step", "stir",
  "stop", "swap", "sync", "tag", "take", "talk", "tap",
  "task", "team", "test", "tie", "tilt", "tip", "tone",
  "top", "toss", "tour", "trim", "trip", "tune", "turn",
  "type", "undo", "use", "vibe", "view", "vote", "walk",
  "want", "wash", "wave", "weld", "win", "wire", "wish",
  "work", "wrap", "yell", "zip", "zoom",
];

/** Nature/element words — premium feel as W1 */
export const NATURE_W1 = [
  "air", "bay", "bloom", "bolt", "burn", "cedar", "clay",
  "cliff", "cloud", "coral", "creek", "crow", "dawn", "dew",
  "dove", "dune", "dust", "elm", "ember", "fern", "fire",
  "flame", "flint", "flora", "fog", "frost", "gale", "gem",
  "glow", "grove", "hawk", "haze", "hill", "ice", "iron",
  "isle", "ivy", "jade", "lake", "leaf", "lily", "marsh",
  "mesa", "mist", "moon", "moss", "north", "oak", "ocean",
  "opal", "palm", "pearl", "petal", "pine", "plum", "pond",
  "rain", "reef", "ridge", "river", "rock", "root", "rose",
  "ruby", "sage", "sand", "shade", "shore", "silk", "sky",
  "slate", "snow", "solar", "south", "spark", "star", "steel",
  "stone", "storm", "sun", "surge", "thorn", "tide", "vale",
  "vine", "wave", "west", "wind", "wolf", "wood",
];

// ─────────────────────────────────────────────
// WORD2 (second word): Nouns, things, concepts
// These go second: {word1}{word2}.com
// ─────────────────────────────────────────────

/** Business/product nouns (2-6 letters) */
export const NOUN_BIZ = [
  "ads", "aid", "aim", "app", "arc", "arts", "bank", "base",
  "bay", "beam", "bell", "belt", "bid", "bill", "block",
  "board", "bolt", "bond", "book", "boss", "box", "brand",
  "brew", "bucks", "build", "bulk", "bus", "cafe", "cage",
  "camp", "card", "cart", "cash", "chain", "chat", "chip",
  "city", "clan", "class", "clerk", "click", "climb", "clip",
  "club", "coach", "code", "coin", "cove", "craft", "crew",
  "crowd", "cup", "dash", "data", "deal", "deck", "den",
  "depot", "desk", "dial", "dock", "dose", "drive", "drop",
  "drum", "edge", "era", "eye", "farm", "feed", "find",
  "fire", "fit", "flag", "flash", "fleet", "flip", "flow",
  "folio", "force", "forge", "fort", "forum", "fuel", "fund",
  "gain", "gang", "gate", "gear", "gem", "gift", "gig",
  "glass", "globe", "grade", "graph", "grid", "group",
  "guard", "guide", "guild", "guru", "hall", "halo",
  "haul", "haven", "heap", "hive", "hook", "hope", "house",
  "hub", "hunt", "hut",
  "inbox", "intel",
  "jam", "jet", "jolt", "joy",
  "keep", "kern", "key", "kit", "knot",
  "lab", "lamp", "lane", "lead", "lens", "level", "lever",
  "lift", "light", "line", "link", "list", "load", "loft",
  "logic", "loop", "lot",
  "map", "mark", "mart", "match", "maze", "media", "mesh",
  "mill", "mind", "mint", "mode", "money", "motor",
  "muse", "myth",
  "name", "nest", "net", "news", "node", "note", "now",
  "offer", "ops",
  "pack", "pad", "page", "pair", "panel", "park", "pass",
  "patch", "path", "pay", "pick", "pile", "pilot", "pin",
  "ping", "pipe", "pixel", "place", "plan", "plant", "plaza",
  "plot", "plug", "plus", "pod", "point", "poll", "pool",
  "port", "post", "pot", "press", "price", "pride", "print",
  "probe", "proof", "prop", "pulse", "pump", "push",
  "quest",
  "rack", "rail", "rank", "rate", "ray", "reach", "realm",
  "rent", "rest", "ride", "ring", "risk", "road", "room",
  "root", "route", "row", "rule", "run",
  "safe", "sage", "sale", "sand", "scale", "scene",
  "scope", "scout", "seal", "seat", "seed", "sense", "set",
  "shelf", "shift", "ship", "shop", "show", "side", "sight",
  "sign", "site", "skill", "skip", "slot", "snap", "sort",
  "space", "span", "spark", "spec", "speed", "split", "spoke",
  "spot", "squad", "stack", "staff", "stage", "stake",
  "stand", "star", "start", "state", "stay", "stem", "step",
  "stock", "stop", "store", "story", "strip", "study",
  "style", "suite", "sum", "swap",
  "tab", "tag", "tale", "tank", "tape", "task", "tax",
  "team", "tell", "term", "text", "tide", "tile", "time",
  "tip", "toll", "tone", "tool", "top", "tower", "town",
  "track", "trade", "trail", "train", "trait", "trap",
  "trend", "tribe", "trick", "trust", "tube", "tune",
  "turn", "type",
  "unit", "user",
  "value", "vault", "verse", "view", "vine", "visa", "voice",
  "void", "volt", "vote",
  "wage", "wall", "ward", "watch", "wave", "way", "web",
  "well", "wheel", "wiki", "wing", "wire", "work", "world",
  "wrap",
  "yard", "year",
  "zen", "zone",
];

/** Tech/digital nouns (2-6 letters) — SaaS/startup appeal */
export const NOUN_TECH = [
  "ai", "api", "app", "bit", "bot", "byte", "chip", "cli",
  "cloud", "code", "core", "cpu", "cyber", "data", "dev",
  "dns", "dock", "edge", "file", "fin", "flux", "fold",
  "fork", "func", "gate", "git", "gpu", "grid", "hack",
  "hash", "heap", "host", "hub", "index", "input", "io",
  "key", "kit", "lab", "lang", "layer", "lib", "link",
  "load", "log", "loop", "map", "mesh", "meta", "ml",
  "mod", "net", "node", "null", "ops", "orm", "os",
  "peer", "pipe", "pixel", "pod", "port", "proxy", "query",
  "queue", "ray", "repo", "rest", "root", "run", "rust",
  "saas", "sdk", "seed", "server", "set", "shell", "sim",
  "site", "snap", "sql", "ssl", "stack", "state", "store",
  "sync", "tab", "tag", "tap", "task", "test", "token",
  "tool", "trace", "tree", "url", "vault", "view", "vm",
  "web", "wiki", "wire", "work", "zero",
];

/** Finance nouns — fintech appeal */
export const NOUN_FIN = [
  "bank", "bid", "bill", "bond", "book", "buck", "bulk",
  "buy", "cap", "card", "cash", "cent", "claim", "coin",
  "cost", "count", "deal", "debt", "earn", "equity", "fee",
  "fin", "float", "flow", "folio", "fund", "gain", "gold",
  "grant", "gross", "hold", "income", "invest", "lend",
  "loan", "lot", "margin", "mint", "money", "net", "note",
  "offer", "order", "own", "pay", "peg", "penny", "price",
  "profit", "rate", "rent", "return", "risk", "roi", "sale",
  "save", "share", "spend", "stake", "stock", "sum", "tax",
  "trade", "trust", "value", "vault", "wage", "wealth",
  "worth", "yield",
];

/** Health/wellness nouns */
export const NOUN_HEALTH = [
  "aid", "body", "bone", "brain", "calm", "care", "cell",
  "clean", "cure", "dose", "drug", "fit", "flex", "gene",
  "glow", "gym", "hair", "heal", "heart", "herb", "life",
  "lung", "med", "mind", "mood", "nerve", "nurse", "pain",
  "pill", "pulse", "rehab", "rest", "serum", "skin", "sleep",
  "soul", "spine", "vital", "well", "yoga", "zen",
];

// ─────────────────────────────────────────────
// COMPLETE WORD SET for real-word detection scoring
// Union of all lists — used to check if a domain contains real words
// ─────────────────────────────────────────────
const _ALL_WORDS_ARRAYS = [
  ADJ_SHORT, VERB_SHORT, NATURE_W1,
  NOUN_BIZ, NOUN_TECH, NOUN_FIN, NOUN_HEALTH,
];

let _allWordsSet: Set<string> | null = null;

/** Lazily built set of ALL known real words (for scoring real-word detection). */
export function getAllWordsSet(): Set<string> {
  if (_allWordsSet) return _allWordsSet;
  _allWordsSet = new Set<string>();
  for (const arr of _ALL_WORDS_ARRAYS) {
    for (const w of arr) _allWordsSet.add(w.toLowerCase());
  }
  // Add extra common words that may not be in the categorized lists
  const EXTRA_COMMON = [
    "about", "above", "after", "again", "also", "area", "auto",
    "back", "best", "blue", "both", "bright", "broad",
    "can", "case", "chief", "choice", "class", "close", "come", "common",
    "dream", "each", "east", "end", "event", "ever", "every", "extra",
    "first", "five", "flat", "four", "front", "game", "get", "global",
    "go", "got", "great", "green", "ground",
    "hand", "home", "human", "idea", "inner", "just",
    "large", "late", "learn", "legal", "less", "level", "light", "local",
    "look", "love", "main", "major", "man", "market", "master", "mega",
    "micro", "mini", "miss", "model", "more", "much", "multi", "music",
    "my", "near", "noble", "off", "on", "other", "out", "over", "own",
    "part", "plain", "play", "point", "power", "prime", "public",
    "quick", "quiet", "quite",
    "ready", "right", "round",
    "second", "short", "side", "sight", "simple", "single", "six", "small",
    "social", "some", "south", "start", "strong", "super", "sweet",
    "test", "that", "the", "their", "them", "then", "third", "three",
    "total", "trade", "travel", "triple", "turn", "two",
    "under", "up", "upper", "urban",
    "very", "video", "visual", "voice",
    "water", "what", "when", "where", "which", "white", "whole",
    "why", "with", "word", "year", "young", "your",
  ];
  for (const w of EXTRA_COMMON) _allWordsSet.add(w.toLowerCase());
  return _allWordsSet;
}

/**
 * Detect real English words contained within a domain name.
 * Returns the best split (longest total real-word coverage).
 * e.g., "fastpay" → ["fast", "pay"], "skyozo" → ["sky"]
 */
export function detectRealWords(name: string): { words: string[]; coverage: number } {
  const lower = name.toLowerCase();
  const dict = getAllWordsSet();
  const len = lower.length;

  // Try all possible 2-word splits
  let bestWords: string[] = [];
  let bestCoverage = 0;

  for (let split = 2; split <= len - 2; split++) {
    const w1 = lower.slice(0, split);
    const w2 = lower.slice(split);
    if (dict.has(w1) && dict.has(w2)) {
      const cov = (w1.length + w2.length) / len;
      if (cov > bestCoverage) {
        bestCoverage = cov;
        bestWords = [w1, w2];
      }
    }
  }

  // Also check if the entire name is a single real word
  if (dict.has(lower) && lower.length / len > bestCoverage) {
    bestCoverage = 1;
    bestWords = [lower];
  }

  // Check partial coverage — at least one word matches
  if (bestWords.length === 0) {
    for (let start = 0; start < len; start++) {
      for (let end = start + 3; end <= len; end++) {
        const sub = lower.slice(start, end);
        if (dict.has(sub) && sub.length > (bestWords[0]?.length ?? 0)) {
          bestWords = [sub];
          bestCoverage = sub.length / len;
        }
      }
    }
  }

  return { words: bestWords, coverage: bestCoverage };
}

/**
 * Check if a domain is a "perfect 2-word" — both halves are real words.
 */
export function isPerfectTwoWord(name: string): boolean {
  const { words, coverage } = detectRealWords(name);
  return words.length === 2 && coverage >= 0.95;
}
