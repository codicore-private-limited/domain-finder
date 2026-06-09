/**
 * Curated real-English word lists for 2-word meaningful domain generation.
 *
 * Design principles:
 * - Every word is a REAL, commonly recognized English word
 * - Words are 2-6 letters max (keeps total domain ≤ 12 chars)
 * - Words are categorized by semantic function (adj, verb, noun, tech, etc.)
 * - No obscure/archaic words — must pass the "would my mom recognize this?" test
 */

import { COMMON_WORDS_RAW } from "./common-words";
import { ALL_WORDS_RAW } from "./all-words";
import { REAL_PHRASES_RAW } from "./phrases";

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

/** Full parsed common-English dictionary (~9k recognizable words, length 3-12). */
export const COMMON_WORDS: string[] = COMMON_WORDS_RAW.split(" ").filter(Boolean);

/**
 * MASTER dictionary — the full English word list (~358k words, length 3-15,
 * already grouped shortest-first). Every entry is a genuine dictionary word,
 * so ANY single-word domain drawn from it is real — this is what lets the
 * hunter sweep “all the world's words” for a free short .com.
 */
export const ALL_WORDS: string[] = ALL_WORDS_RAW.split(" ").filter(Boolean);

/**
 * REAL PHRASES — genuine two-word concepts people actually write, mined from
 * the Google web corpus and ranked by real-world usage ("demand"). These are
 * the brandable, sellable names (realestate, creditcard, healthcare,
 * weightloss, sourcecode …). Each entry carries a 0-100 demand score.
 * Ordered MOST-DEMAND-FIRST.
 */
export interface PhraseEntry {
  phrase: string;
  demand: number;
}

// ─────────────────────────────────────────────
// CURATED MODERN HIGH-VALUE PHRASES — the diamonds the user actually wants.
// ─────────────────────────────────────────────
// The Norvig web corpus is old (pre-2012) and misses modern, high-resale
// concepts. This hand-picked list adds genuinely meaningful, brandable two-word
// .com concepts from today's most valuable markets — AI, fintech, climate,
// health-tech, crypto, SaaS, dev-tools (setuser-style) — that companies pay
// lakhs/crores for. Each is two REAL recognizable words fused into a clean,
// sayable brand. These are swept FIRST (highest priority) every cycle.
const CURATED_MODERN_PHRASES: string[] = [
  // AI / ML
  "aitools", "aiagent", "aiagents", "aicloud", "aichat", "aicoach", "aidata",
  "aidoctor", "aiengine", "ailab", "ailabs", "aimodel", "aipower", "airobot",
  "aistudio", "aivoice", "aiwriter", "smartai", "openai", "deepai", "neuralnet",
  "promptlab", "modelhub", "datamind", "brainchip",
  // Smart home / IoT
  "smarthome", "smarthub", "smartlife", "smartcity", "smartgrid", "smartlock",
  "smartcam", "smartfarm", "homehub", "homelink", "homecloud", "livingsmart",
  // Clean / green energy
  "cleanenergy", "cleanpower", "cleantech", "greenenergy", "greenpower",
  "greentech", "solarpower", "solarcloud", "windpower", "powergrid",
  "energyhub", "carbonzero", "netzero", "ecopower", "ecotech", "ecocharge",
  // Fintech / money
  "paycloud", "payflow", "payhub", "paylink", "payzone", "fastpay", "smartpay",
  "cashflow", "cashapp", "moneyhub", "moneyflow", "fundbase", "wealthhub",
  "investhub", "tradehub", "tradeflow", "creditflow", "loanhub", "bankcloud",
  // Crypto / web3
  "cryptohub", "cryptobase", "chainlink", "blockbase", "coinflow", "coinhub",
  "tokenhub", "walletbase", "ledgerhub", "stakepool",
  // Health / wellness
  "healthhub", "healthcloud", "healthapp", "carehub", "carecloud", "mindcare",
  "mindspace", "bodycare", "wellhub", "fithub", "fitcloud", "sleepwell",
  "braincare", "genecare", "biocloud", "medhub", "medcloud", "therapyhub",
  // SaaS / dev tools (setuser-style)
  "setuser", "getuser", "userflow", "userhub", "datasync", "datahub",
  "datacloud", "codehub", "codebase", "devhub", "devtools", "buildflow",
  "cloudbase", "cloudhub", "apphub", "appflow", "taskflow", "workhub",
  "teamflow", "teamhub", "flowbase", "stackhub", "logichub", "querybase",
  // Commerce / brand
  "shophub", "shopflow", "storehub", "brandhub", "marketflow", "salehub",
  "dealhub", "tradebase", "buyhub", "orderflow",
  // ── 2026 deep-tech expansion (genuine, meaningful, high-value concepts) ──
  // AI agents / inference (the dominant 2026 narrative)
  "agentflow", "agenthub", "agentbase", "agentcloud", "agentkit", "agentgrid",
  "agentstack", "inferhub", "inferflow", "modelbase", "modelflow", "tokenflow",
  "promptflow", "prompthub", "reasonai", "visionai", "voiceai", "agentic",
  "copilothub", "neuralhub", "neuralflow", "synthdata", "vectorhub", "vectordb",
  // Robotics / autonomy
  "robothub", "robotflow", "robotcloud", "autobot", "autopilot", "dronehub",
  "dronebase", "droneflow", "swarmbot", "humanoidai", "robotaxi", "selfdrive",
  // Quantum
  "quantumhub", "quantumlab", "quantumflow", "qubithub", "qubitlab", "quantumai",
  "quantumcloud", "quantumchip", "quantumnet", "quantumcore",
  // Biotech / gene / pharma (generic, legal product framings)
  "genehub", "genecloud", "geneflow", "genelab", "genetherapy", "geneedit",
  "crisprlab", "crisprhub", "proteinai", "proteinlab", "celltherapy", "cellhub",
  "neurohub", "neurolab", "neurotech", "brainchipai", "biolab", "biohub",
  "biotechhub", "longevitylab", "mrnalab", "vaccinehub", "peptidelab",
  // Green energy / fusion / hydrogen (the karodon-value science framings)
  "fusionhub", "fusionlab", "fusionpower", "fusionenergy", "hydrogenhub",
  "hydrogenpower", "greenhydrogen", "batteryhub", "batterylab", "batterytech",
  "solidstate", "gridflow", "gridhub", "microgrid", "powerflow", "fusionchip",
  "carboncapture", "carbonhub", "climatetech", "climatehub", "geothermalhub",
  // Space / defense
  "spacehub", "spacelab", "spaceflow", "orbithub", "orbitlab", "satellitehub",
  "lunarhub", "marshub", "rockethub", "launchpad", "spacecloud", "orbitcloud",
];

export const REAL_PHRASES: PhraseEntry[] = (() => {
  const seen = new Set<string>();
  const out: PhraseEntry[] = [];
  // 1) Curated modern concepts first — top priority, fixed high demand.
  for (const phrase of CURATED_MODERN_PHRASES) {
    const p = phrase.toLowerCase();
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ phrase: p, demand: 95 });
  }

  // 2) Corpus phrases — but the Norvig bigram corpus is FULL of grammar-filler
  // fragments ("still like", "people seem", "never seem", "based solely") that
  // are technically two words but NOT meaningful, brandable, sellable concepts.
  // We keep a phrase ONLY if it splits cleanly into two genuine CONTENT words
  // (both ≥3 letters, both real, NEITHER a stop/filler word). That throws out
  // the grammar junk and leaves real concepts (realestate, sourcecode …).
  const PHRASE_STOPWORDS = new Set<string>([
    // pronouns / determiners
    "you", "his", "her", "its", "our", "their", "this", "that", "these",
    "those", "who", "whom", "whose", "which", "what", "whatever", "whoever",
    "some", "any", "all", "both", "each", "every", "few", "many", "such",
    "none", "one", "other", "another", "same",
    // auxiliaries / be-have-do
    "are", "was", "were", "been", "being", "has", "have", "had", "does",
    "did", "done", "doing", "will", "would", "shall", "should", "can",
    "could", "may", "might", "must", "ought",
    // adverbs / fillers
    "still", "just", "only", "even", "also", "too", "very", "much", "more",
    "most", "quite", "rather", "almost", "always", "never", "often", "now",
    "then", "here", "there", "soon", "later", "again", "once", "ever", "yet",
    "really", "truly", "simply", "merely", "solely", "mainly", "mostly",
    "largely", "perhaps", "maybe", "indeed", "however", "therefore", "thus",
    "hence", "else", "enough", "instead", "anyway", "somewhat",
    // conjunctions / prepositions
    "and", "but", "nor", "for", "yet", "because", "since", "although",
    "though", "while", "whereas", "unless", "until", "whether", "than",
    "when", "where", "why", "how", "into", "onto", "upon", "about", "above",
    "below", "under", "over", "between", "among", "through", "during",
    "before", "after", "against", "toward", "towards", "per", "via",
    // weak/generic verbs → grammar fragments
    "seem", "seems", "seemed", "tend", "tends", "tended", "like", "likes",
    "liked", "makes", "made", "know", "knows", "knew", "known", "says",
    "said", "tells", "told", "asks", "asked", "gets", "got", "gotten",
    "goes", "went", "gone", "comes", "came", "takes", "took", "gives",
    "gave", "puts", "lets", "keeps", "kept", "looks", "looked", "wants",
    "wanted", "needs", "needed", "feels", "felt", "thinks", "thought",
    "finds", "begins", "began", "begun", "lies", "lie", "died", "die",
    "dies", "based", "aged", "listed", "dated", "equal", "seeing", "going",
    "being", "having", "doing", "saying", "trying", "using",
    // generic time / people nouns that read as fragments
    "people", "person", "someone", "anyone", "everyone", "nobody",
    "somebody", "thing", "things", "something", "anything", "nothing",
    "today", "tomorrow", "yesterday", "always", "never",
    // adult / pharma / spam-adjacent — never surface these
    "young", "pics", "pic", "soma", "nude", "naked", "sexy", "teen", "teens",
    "babes", "girls", "viagra", "cialis", "xanax", "valium", "tramadol",
    "phentermine", "ambien", "casino", "poker", "gambling", "bingo",
  ]);
  const contentWords = new Set<string>(COMMON_WORDS);
  for (const arr of _ALL_WORDS_ARRAYS) for (const w of arr) contentWords.add(w);
  const looksMeaningful = (phrase: string): boolean => {
    for (let i = 3; i <= phrase.length - 3; i++) {
      const a = phrase.slice(0, i);
      const b = phrase.slice(i);
      if (
        contentWords.has(a) &&
        contentWords.has(b) &&
        !PHRASE_STOPWORDS.has(a) &&
        !PHRASE_STOPWORDS.has(b)
      ) {
        return true;
      }
    }
    return false;
  };

  for (const tok of REAL_PHRASES_RAW.split(" ").filter(Boolean)) {
    const i = tok.lastIndexOf(":");
    const phrase = tok.slice(0, i);
    if (seen.has(phrase)) continue;
    if (!looksMeaningful(phrase)) continue;
    seen.add(phrase);
    out.push({ phrase, demand: Number(tok.slice(i + 1)) || 0 });
  }
  return out;
})();

let _phraseDemand: Map<string, number> | null = null;
/** Map of fused phrase → demand (0-100). */
export function getPhraseDemandMap(): Map<string, number> {
  if (_phraseDemand) return _phraseDemand;
  _phraseDemand = new Map();
  for (const p of REAL_PHRASES) _phraseDemand.set(p.phrase, p.demand);
  return _phraseDemand;
}

/** Real-world demand (0-100) for a name, or 0 if it is not a known phrase. */
export function phraseDemand(name: string): number {
  return getPhraseDemandMap().get(name.toLowerCase()) ?? 0;
}

/** True when the name is a known real two-word phrase. */
export function isRealPhrase(name: string): boolean {
  return getPhraseDemandMap().has(name.toLowerCase());
}

let _bigWordSet: Set<string> | null = null;
/** Set form of ALL_WORDS (+ curated lists) for O(1) single-word lookups. */
export function getBigWordSet(): Set<string> {
  if (_bigWordSet) return _bigWordSet;
  _bigWordSet = new Set<string>(ALL_WORDS);
  for (const arr of _ALL_WORDS_ARRAYS) for (const w of arr) _bigWordSet.add(w);
  for (const w of COMMON_WORDS) _bigWordSet.add(w);
  return _bigWordSet;
}

/** True when the WHOLE name is a single real dictionary word. */
export function isRealWord(name: string): boolean {
  return getBigWordSet().has(name.toLowerCase());
}

let _commonWordSet: Set<string> | null = null;
/** Set of RECOGNIZABLE common words only (excludes obscure scientific/Latin). */
export function getCommonWordSet(): Set<string> {
  if (_commonWordSet) return _commonWordSet;
  _commonWordSet = new Set<string>(COMMON_WORDS);
  for (const arr of _ALL_WORDS_ARRAYS) for (const w of arr) _commonWordSet.add(w);
  return _commonWordSet;
}

/** True when the name is a single, RECOGNIZABLE common word (not obscure). */
export function isRecognizableWord(name: string): boolean {
  return getCommonWordSet().has(name.toLowerCase());
}

/**
 * One-word generation pool: only RECOGNIZABLE common words (4-9 letters) that
 * an ordinary person would know — NOT obscure scientific/Latin dictionary
 * entries (seiurus, bombesin, nauplii …). Ordered SHORTEST-FIRST so the hunter
 * tries 4-letter words first, then 5, etc. Junk acronyms/initialisms removed.
 *
 * (Single-word DETECTION still uses the full dictionary via getBigWordSet, so a
 * user can look up any real word — we just don't proactively hunt obscure ones.)
 */
const _ONE_WORD_JUNK = new Set([
  "aaa", "abc", "abs", "acc", "abu", "aol", "faq", "etc", "inc", "ltd", "llc",
  "dvd", "usb", "pdf", "url", "seo", "ceo", "cfo", "cto", "sql", "api", "gif",
  "jpg", "png", "css", "php", "xml", "rss", "sms", "gps", "atm", "fyi", "diy",
]);
export const ONE_WORD_POOL: string[] = COMMON_WORDS
  .filter((w) => w.length >= 4 && w.length <= 9 && !_ONE_WORD_JUNK.has(w))
  .sort((a, b) => a.length - b.length);

/** Real 4-letter recognizable words — the rarest, most valuable one-word .coms. */
export const FOUR_LETTER_WORDS: string[] = COMMON_WORDS.filter(
  (w) => w.length === 4 && !_ONE_WORD_JUNK.has(w),
);

/**
 * A word is "good" for hunting: only letters, contains a vowel (drops ctrl,
 * blvd, eqpt…), and is not a junk acronym/initialism.
 */
function _isGoodWord(w: string): boolean {
  if (!/^[a-z]+$/.test(w)) return false;
  if (!/[aeiou]/.test(w)) return false;
  if (_ONE_WORD_JUNK.has(w)) return false;
  return true;
}

/**
 * BIG GOOD ONE-WORD POOL — the world's good dictionary words, hunted one by one.
 * Built from the master frequency-ranked dictionary (ALL_WORDS, most-common-
 * first within each length): we keep the most-common FRACTION of every length
 * bucket so genuinely recognizable words stay (search, attain, corpse, drowsy,
 * cashew…) while the obscure scientific/Latin tail (seiurus, bombesin, bunyip,
 * merkin…) is dropped. All curated common words are folded in too. ~29k clean,
 * good, real English words — ordered SHORTEST-FIRST (3-letter premium first).
 * This is the user's "duniya ke saare acche dictionary words" pool.
 */
const _GOOD_WORD_FRACTION: Record<number, number> = {
  3: 1.0, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.33, 8: 0.28,
  9: 0.22, 10: 0.18, 11: 0.12, 12: 0.08,
};
export const ONE_WORD_GOOD: string[] = (() => {
  const byLen = new Map<number, string[]>();
  for (const w of ALL_WORDS) {
    const L = w.length;
    if (L < 3 || L > 12) continue;
    if (!byLen.has(L)) byLen.set(L, []);
    byLen.get(L)!.push(w);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let L = 3; L <= 12; L++) {
    const arr = byLen.get(L) ?? [];
    const keep = Math.floor(arr.length * (_GOOD_WORD_FRACTION[L] ?? 0));
    for (let i = 0; i < keep; i++) {
      const w = arr[i]!;
      if (seen.has(w) || !_isGoodWord(w)) continue;
      seen.add(w);
      out.push(w);
    }
  }
  // Always include every curated recognizable common word.
  for (const w of COMMON_WORDS) {
    if (w.length < 3 || w.length > 12) continue;
    if (seen.has(w) || !_isGoodWord(w)) continue;
    seen.add(w);
    out.push(w);
  }
  out.sort((a, b) => a.length - b.length);
  return out;
})();

let _oneWordGoodSet: Set<string> | null = null;
/** Set form of ONE_WORD_GOOD for O(1) sellability checks. */
export function getOneWordGoodSet(): Set<string> {
  if (!_oneWordGoodSet) _oneWordGoodSet = new Set(ONE_WORD_GOOD);
  return _oneWordGoodSet;
}
/** True when the name is one of the world's good single dictionary words. */
export function isGoodOneWord(name: string): boolean {
  return getOneWordGoodSet().has(name.toLowerCase());
}

// ─────────────────────────────────────────────
// VERB + NOUN MATRIX — the "SetUser pattern" engine (user's core request).
// Systematically fuses real ACTION VERBS with real TECH/BUSINESS NOUNS to mass-
// produce genuine, meaningful, brandable two-word .com candidates:
//   setuser, getdata, paycloud, buildapp, trackorder, syncteam, sharefile …
// Quality stays HIGH (no keephut/knitvoid junk) because:
//   (a) BOTH halves are real, common English words, AND
//   (b) the second word is ALWAYS a tech/business noun (never a random noun
//       like "hut"), AND
//   (c) the elimination filter drops 3-consonant / 3-vowel / hard-cluster combos.
// This is exactly how setuser.com-style names are surfaced — at scale.
// ─────────────────────────────────────────────

/** Real action verbs that read well as the FIRST half of a product name. */
const VN_ACTION_VERBS = [
  "set", "get", "use", "go", "run", "pay", "buy", "sell", "send", "ship",
  "make", "build", "find", "join", "save", "sync", "link", "load", "lock",
  "mint", "scan", "swap", "tap", "track", "trade", "pick", "post", "push",
  "pull", "draw", "edit", "flow", "fund", "grow", "hire", "hold", "keep",
  "lead", "list", "log", "map", "mix", "move", "name", "note", "open",
  "plan", "play", "rank", "rate", "read", "rent", "roll", "scale", "score",
  "share", "shop", "show", "sign", "snap", "sort", "spin", "start", "stack",
  "store", "stream", "tag", "talk", "test", "tip", "tour", "trace", "trim",
  "tune", "vote", "work", "write", "zoom", "boost", "brand", "cast", "chat",
  "check", "claim", "clear", "click", "close", "code", "craft", "deal",
  "deploy", "drive", "drop", "earn", "fetch", "fix", "focus", "forge",
  "frame", "gain", "give", "guide", "hack", "launch", "learn", "lift",
  "match", "merge", "mine", "order", "pair", "pitch", "raise", "reach",
  "route", "scout", "seek", "serve", "shift", "spark", "speak", "spend",
  "stake", "steer", "stock", "study", "style", "surf", "sweep", "swipe",
  "teach", "team", "tend", "touch", "train", "treat", "trek", "trip",
  "vend", "view", "watch", "weave", "win", "wire", "wrap", "yield",
];

/** Real tech / business nouns that read well as a domain word half. */
const VN_TECH_NOUNS = [
  "user", "data", "pay", "cloud", "app", "flow", "hub", "code", "net",
  "bot", "shop", "cart", "deal", "task", "team", "work", "store", "page",
  "link", "list", "mail", "chat", "call", "desk", "base", "box", "card",
  "cash", "coin", "deck", "disk", "dock", "feed", "file", "fund", "gate",
  "gear", "grid", "key", "kit", "lab", "lane", "line", "loop", "mark",
  "mesh", "mint", "mode", "node", "note", "path", "pin", "plan", "pod",
  "point", "pool", "port", "post", "rack", "rail", "rate", "room", "root",
  "scope", "seed", "ship", "shot", "site", "slot", "space", "span", "spot",
  "stack", "stat", "step", "sync", "tab", "tag", "tank", "tech", "text",
  "tile", "time", "tool", "top", "track", "trade", "tube", "unit", "vault",
  "view", "vibe", "wall", "wave", "way", "web", "wire", "word", "world",
  "yard", "zone", "agent", "brand", "brain", "chain", "chart", "class",
  "club", "crew", "edge", "field", "force", "forge", "frame", "graph",
  "group", "guide", "house", "image", "index", "lens", "light", "logic",
  "market", "media", "metric", "model", "money", "motion", "order", "panel",
  "phase", "pixel", "place", "power", "price", "proof", "queue", "quest",
  "radar", "ratio", "realm", "scene", "score", "sense", "sheet", "shelf",
  "signal", "skill", "slate", "sphere", "stage", "state", "story", "studio",
  "suite", "system", "table", "theme", "token", "trend", "tribe", "value",
  "vector", "venue", "vision", "voice", "wallet", "wealth", "wheel",
];

// Local elimination filter (the user's "Kachra Safai"): reject 3+ consecutive
// consonants, 3+ consecutive vowels, or known hard letter clusters. Kept local
// to avoid a circular import with scoring.ts.
const _VN_VOWELS = new Set(["a", "e", "i", "o", "u"]);
const _VN_HARD = [
  "bk", "bm", "bp", "cg", "cj", "cv", "dk", "fk", "fp", "gk", "hk", "jq",
  "kq", "kv", "kx", "kz", "mk", "pf", "pk", "qx", "sx", "tk", "vk", "vm",
  "wx", "xj", "xk", "zx", "xz", "sj", "tj", "dt", "td", "kd",
];
function _vnReject(s: string): boolean {
  let cc = 0;
  let vv = 0;
  for (const ch of s) {
    if (_VN_VOWELS.has(ch)) {
      vv++;
      cc = 0;
      if (vv >= 3) return true;
    } else {
      cc++;
      vv = 0;
      if (cc >= 3) return true;
    }
  }
  for (const h of _VN_HARD) if (s.includes(h)) return true;
  return false;
}

/**
 * The full Verb+Noun (and Noun+Noun) matrix, quality-filtered. This is the big,
 * fresh pool of setuser-style names the hunter sweeps for available .com.
 */
export const VERB_NOUN_POOL: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  const tryAdd = (a: string, b: string) => {
    if (a === b) return;
    const name = a + b;
    if (name.length < 5 || name.length > 13) return;
    if (seen.has(name)) return;
    if (_vnReject(name)) return;
    seen.add(name);
    out.push(name);
  };
  // 1) Verb + Noun (the core SetUser pattern): setuser, getdata, paycloud …
  for (const v of VN_ACTION_VERBS) for (const n of VN_TECH_NOUNS) tryAdd(v, n);
  // 2) Noun + Noun (dataflow, codebase, paywall, teamhub …) — also genuine.
  for (const a of VN_TECH_NOUNS) for (const b of VN_TECH_NOUNS) tryAdd(a, b);
  return out;
})();

let _verbNounSet: Set<string> | null = null;
/** Set form of VERB_NOUN_POOL for O(1) sellability checks. */
export function getVerbNounSet(): Set<string> {
  if (!_verbNounSet) _verbNounSet = new Set(VERB_NOUN_POOL);
  return _verbNounSet;
}
/** True when the name is one of our curated-quality Verb+Noun / Noun+Noun combos. */
export function isVerbNounName(name: string): boolean {
  return getVerbNounSet().has(name.toLowerCase());
}

/**
 * THE HUNT POOL — the complete, ordered list of every name the hunter probes.
 * Order = priority for first-check each cycle (recheck later covers everything):
 *   1) premium SHORT good words (3-6 letters) — the holy-grail one-word .coms
 *   2) curated modern high-value phrases (smarthome, aitools, setuser-style)
 *   3) the rest of the good one-word pool (7-12 letters)
 *   4) demand-ranked real corpus phrases
 * No random combos, no junk — only genuine, sellable "hira" candidates.
 */
export const HUNT_POOL: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (n: string) => {
    const l = n.toLowerCase();
    if (!seen.has(l)) {
      seen.add(l);
      out.push(l);
    }
  };
  for (const w of ONE_WORD_GOOD) if (w.length <= 6) add(w);
  for (const p of CURATED_MODERN_PHRASES) add(p);
  // The big Verb+Noun / Noun+Noun matrix (setuser, getdata, paycloud …) — the
  // user's core "SetUser pattern" pool, swept right after the curated phrases.
  for (const p of VERB_NOUN_POOL) add(p);
  for (const w of ONE_WORD_GOOD) add(w);
  for (const p of REAL_PHRASES) add(p.phrase);
  return out;
})();

/**
 * Curated brandable 2-letter tokens. These are the ONLY sub-3-letter words we
 * accept as segments — everything else of length ≤ 2 is excluded so we never
 * stitch a meaningless name together out of noise syllables.
 */
export const TWO_LETTER_ALLOW = [
  "go", "my", "hi", "ok", "ai", "io", "up", "ex", "co", "hq", "by", "id", "ad",
];

/**
 * Non-word acronyms that may slip in via the curated/common lists but read as
 * gibberish when fused (e.g. "lib"+"ice", "api"+"core", "solo"+"ml"). They are
 * deleted from the dictionary so names can only be built from genuinely
 * readable words. ("ai" and "io" are intentionally kept — they are core to the
 * tech/startup theme and widely recognized.)
 */
const JUNK_TOKENS = [
  "api", "cli", "cpu", "dns", "gpu", "lib", "orm", "sql", "ssl", "sdk",
  "url", "vm", "ml", "os", "saas", "dll", "css", "php", "xml", "ftp",
  "ssh", "vpn", "ram", "rom", "usb", "seo", "ceo", "cto", "cfo", "html",
  "http", "kpi", "roi", "crm", "erp", "ide", "ssd", "hdd",
];

let _allWordsSet: Set<string> | null = null;

/** Lazily built set of ALL known real words (for scoring real-word detection). */
export function getAllWordsSet(): Set<string> {
  if (_allWordsSet) return _allWordsSet;
  _allWordsSet = new Set<string>();
  for (const arr of _ALL_WORDS_ARRAYS) {
    for (const w of arr) _allWordsSet.add(w.toLowerCase());
  }
  // Fold in the large curated common-English dictionary (~9k recognizable words).
  for (const w of COMMON_WORDS) _allWordsSet.add(w);
  // Plus the tight brandable 2-letter allow-list.
  for (const w of TWO_LETTER_ALLOW) _allWordsSet.add(w);
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
  // Strip non-word acronyms so gibberish can't falsely segment (e.g. "libice").
  for (const j of JUNK_TOKENS) _allWordsSet.delete(j);
  return _allWordsSet;
}

// ─────────────────────────────────────────────
// WORD-BREAK SEGMENTATION — the heart of "is this a real, meaningful name?"
// ─────────────────────────────────────────────

const MAX_WORDS = 3;

function isBetterSegmentation(a: string[], b: string[] | null): boolean {
  if (!b) return true;
  if (a.length !== b.length) return a.length < b.length; // fewer words wins
  const minA = Math.min(...a.map((w) => w.length));
  const minB = Math.min(...b.map((w) => w.length));
  return minA > minB; // more balanced split wins
}

/**
 * Segment a name into the best sequence of real dictionary words.
 * "Best" = fewest words, then the most balanced split (largest minimum word).
 * Returns null when the WHOLE name cannot be covered by 1-3 real words.
 * e.g. "setuser" → ["set","user"], "fastpay" → ["fast","pay"],
 *      "getmybook" → ["get","my","book"], "gapib" → null.
 */
export function segmentWords(name: string): string[] | null {
  const s = name.toLowerCase();
  if (!/^[a-z]+$/.test(s)) return null;
  const n = s.length;
  const dict = getAllWordsSet();
  const dp: (string[] | null)[] = new Array(n + 1).fill(null);
  dp[0] = [];
  for (let i = 1; i <= n; i++) {
    const start = Math.max(0, i - 12);
    for (let j = start; j < i; j++) {
      const prev = dp[j];
      if (!prev || prev.length >= MAX_WORDS) continue;
      const w = s.slice(j, i);
      if (!dict.has(w)) continue;
      const cand = [...prev, w];
      if (isBetterSegmentation(cand, dp[i])) dp[i] = cand;
    }
  }
  return dp[n] ?? null;
}

/**
 * Decide whether a name is a genuinely meaningful domain: fully composed of
 * 1-3 real words with a sensible structure (no all-tiny stitching).
 * Returns the winning segmentation, or null when the name is gibberish.
 */
export function meaningfulSegments(name: string): string[] | null {
  const lower = name.toLowerCase();
  // 1) The WHOLE name is a single real dictionary word → accept outright.
  //    This unlocks every one-word domain from the full 358k word list.
  if (isRealWord(lower)) return [lower];
  // 2) The name is a known real two-word phrase from the demand corpus
  //    (e.g. "realestate", "creditcard", "setuser") → accept.
  if (isRealPhrase(lower)) return [lower];
  // 3) Otherwise require a clean 2-3 word split from the curated dictionary
  //    (keeps fused combos genuinely readable, never acronym/obscure soup).
  const seg = segmentWords(lower);
  if (!seg || seg.length < 2 || seg.length > MAX_WORDS) return null;
  const maxLen = Math.max(...seg.map((w) => w.length));
  if (maxLen < 3) return null; // pure 2-letter combos are not real domains
  const tiny = seg.filter((w) => w.length <= 2).length;
  if (tiny > 1) return null; // at most one short connector token
  return seg;
}

/** Fast boolean form of meaningfulSegments. */
export function isMeaningfulDomain(name: string): boolean {
  return meaningfulSegments(name) !== null;
}

// ─────────────────────────────────────────────
// STRICT quality gate — what the hunter is allowed to keep/surface.
// ─────────────────────────────────────────────
// ONLY genuine, sellable names qualify as a "hira":
//   1) one of the world's GOOD single dictionary words (vault, signal, drowsy,
//      cashew …) — obscure scientific/Latin junk (seiurus, bombesin) excluded,
//   2) a known real, meaningful two-word phrase (realestate, smarthome, aitools,
//      setuser …).
// Random combos (keephut, knitvoid) and grammar/adult/pharma junk are REJECTED.
export function isSellableDomain(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    isGoodOneWord(lower) ||
    isRecognizableWord(lower) ||
    isRealPhrase(lower) ||
    isVerbNounName(lower)
  );
}

/**
 * Detect real English words contained within a domain name.
 * Backed by the full word-break segmenter so coverage is exact.
 * e.g., "fastpay" → ["fast","pay"] coverage 1, "skyozo" → ["sky"] partial.
 */
export function detectRealWords(name: string): { words: string[]; coverage: number } {
  const lower = name.toLowerCase();
  const len = lower.length || 1;

  // Preferred: a clean full segmentation into 1-3 real words.
  const seg = meaningfulSegments(lower);
  if (seg) {
    const covered = seg.reduce((sum, w) => sum + w.length, 0);
    return { words: seg, coverage: covered / len };
  }

  // Fallback: longest single embedded real word (partial coverage only).
  const dict = getAllWordsSet();
  let best = "";
  for (let start = 0; start < len; start++) {
    for (let end = start + 3; end <= len; end++) {
      const sub = lower.slice(start, end);
      if (sub.length > best.length && dict.has(sub)) best = sub;
    }
  }
  if (best) return { words: [best], coverage: best.length / len };
  return { words: [], coverage: 0 };
}

/**
 * Check if a domain is a "perfect 2-word" — both halves are real words.
 */
export function isPerfectTwoWord(name: string): boolean {
  const seg = meaningfulSegments(name);
  return !!seg && seg.length === 2;
}
