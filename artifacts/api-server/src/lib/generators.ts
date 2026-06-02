import { isVowel, hasAwkwardCluster, patternOf } from "./scoring";
import {
  ADJ_SHORT, VERB_SHORT, NATURE_W1,
  NOUN_BIZ, NOUN_TECH, NOUN_FIN, NOUN_HEALTH,
  detectRealWords, isPerfectTwoWord,
} from "./wordlists";

const BLOCKED_FRAGMENTS = [
  "fuck", "fuk", "fuq", "shit", "cunt", "dick", "cock", "pussy", "bitch",
  "nigg", "rape", "porn", "anal", "anus", "tits", "boob", "slut", "whore",
  "fag", "homo", "kkk", "nazi", "kike", "spic", "chink", "hitler", "isis",
  "jihad", "kill", "die", "dead", "suck", "ugly", "scam", "fraud", "spam",
  "junk", "trash", "vagina", "penis", "sex", "xxx", "loli", "incest",
];

function isClean(name: string): boolean {
  const lower = name.toLowerCase();
  for (const bad of BLOCKED_FRAGMENTS) {
    if (lower.includes(bad)) return false;
  }
  return true;
}

const CONSONANTS = "bcdfghjklmnpqrstvwxyz".split("");
const PRIMARY_CONS = "bdfgklmnprstvz".split("");
const VOWELS_LIST = "aeiou".split("");

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Apply 0-2 character-level mutations to a base string, creating near-infinite
// variation from finite vocabulary lists.
function morphed(base: string, rng: () => number, ops = 1): string {
  let s = base;
  for (let i = 0; i < ops; i++) {
    const op = rng();
    if (s.length === 0) break;
    if (op < 0.30 && s.length > 4) {
      // delete a random char
      const pos = Math.floor(rng() * s.length);
      s = s.slice(0, pos) + s.slice(pos + 1);
    } else if (op < 0.55 && s.length < 8) {
      // insert a phonetically balanced char
      const pos = 1 + Math.floor(rng() * (s.length - 1));
      const prev = s[pos - 1] ?? "";
      const ch = isVowel(prev) ? pick(PRIMARY_CONS, rng) : pick(VOWELS_LIST, rng);
      s = s.slice(0, pos) + ch + s.slice(pos);
    } else {
      // replace a char in-place with same phonetic class
      const pos = Math.floor(rng() * s.length);
      const cur = s[pos] ?? "";
      const ch = isVowel(cur) ? pick(VOWELS_LIST, rng) : pick(PRIMARY_CONS, rng);
      s = s.slice(0, pos) + ch + s.slice(pos + 1);
    }
  }
  return s.replace(/[^a-z]/g, "");
}

// ─────────────────────────────────────────────
// FUTURE SUFFIX
// ─────────────────────────────────────────────
const FUTURE_SUFFIXES: Record<string, string[]> = {
  ai: ["mind", "sync", "core", "logic", "neural", "vertex", "nexus", "pulse", "sense", "vex", "node", "flux", "iq", "bit", "fy", "lex", "nix", "bot"],
  quantum: ["qbit", "qore", "wave", "node", "grid", "vertex", "layer", "leap", "flux", "spin", "gate", "orbit", "pair", "onic"],
  biotech: ["bio", "gene", "cell", "vita", "lyte", "zoa", "morph", "base", "helix", "codon", "lyze", "form", "mab", "fect"],
  green_energy: ["volt", "grid", "pulse", "flux", "solr", "leaf", "loop", "gen", "gy", "cell", "watt", "eco", "reen", "sun"],
  space_tech: ["orbit", "warp", "nova", "quasr", "comet", "stellr", "void", "nav", "lyze", "axia", "exo", "grav", "vec"],
};

const FUTURE_PREFIXES: Record<string, string[]> = {
  ai: ["neural", "cog", "synap", "deep", "axion", "algo", "deno", "infr", "geni", "corp", "neur", "lumo", "vect", "kera"],
  quantum: ["qore", "qubo", "entangl", "wave", "axiq", "qura", "quanta", "quasar", "qnum", "qlink", "qphi"],
  biotech: ["geno", "cyto", "helix", "nucl", "myco", "prion", "amylo", "meso", "macro", "micro", "nano", "pico"],
  green_energy: ["eco", "verd", "lume", "sol", "kine", "helios", "zeph", "terra", "viro", "atmo", "carbo"],
  space_tech: ["astra", "orbi", "nebu", "lumen", "exo", "cosmo", "galac", "lunar", "helio", "xeno", "axia"],
};

// ─────────────────────────────────────────────
// TRANSLITERATION — massively expanded
// ─────────────────────────────────────────────
const TRANSLIT_ROOTS = [
  // Sanskrit / Hindi-origin
  "agni", "indra", "shakti", "tejas", "dharma", "veda", "surya", "karma",
  "prana", "akash", "vajra", "chandra", "arya", "rudra", "naga", "soma",
  "mitra", "kama", "kali", "deva", "yuga", "rasa", "sura", "vira",
  "maya", "tara", "danu", "manu", "rishi", "siddhi", "tantra", "yantra",
  // Spanish / Latin-origin
  "vega", "vita", "lumen", "alma", "fuego", "nuevo", "primo", "terra",
  "luna", "solar", "aqua", "forma", "porta", "campo", "vivo", "modo",
  "recto", "fiero", "bravo", "claro", "libre", "puro", "nivel", "mundo",
  // Japanese-origin short roots
  "kira", "nori", "yuki", "hana", "sora", "kaze", "umi", "tori", "mori",
  "shiro", "kuro", "neko", "tama", "furi", "yume", "mika", "ryuu",
  // Arabic-origin
  "noor", "alam", "hakim", "rafi", "zara", "amir", "badr", "nasr",
  "wafi", "amin", "hani", "sami", "adil", "faiz", "riza", "wali",
  // Greek-origin tech morphemes
  "aeon", "bios", "gaia", "helio", "kosmo", "logos", "nomo", "onyx",
  "phos", "rheo", "synth", "telos", "xeno", "zeta", "plex", "naut",
];

const TRANSLIT_SUFFIXES = [
  "ola", "ify", "io", "ly", "go", "kart", "mind", "wave", "iq",
  "ex", "ix", "ox", "ax", "an", "on", "in", "un", "en",
  "us", "or", "ar", "er", "ia", "ya", "aya", "ora", "ura",
  "ika", "ika", "aka", "eka", "oka", "uka",
  "fy", "vy", "zy", "py", "ty",
  "ael", "iel", "uel", "eel",
];

// ─────────────────────────────────────────────
// PREFIX-ROOT — vastly expanded with morphing
// ─────────────────────────────────────────────
const PREMIUM_PREFIXES = [
  "neo", "meta", "syn", "omni", "hyper", "ultra", "para", "proto",
  "trans", "infra", "exo", "endo", "cyber", "bio", "geo", "helio",
  "lumin", "vivo", "auro", "kine", "tera", "nano", "pico", "giga",
  "mega", "zeta", "peta", "atto", "quant", "virt", "algo", "auto",
  "moto", "loco", "colo", "digi", "tele", "poly", "mono", "duo",
  "tri", "quad", "hex", "octo", "deca", "multi", "inter", "intra",
  "supra", "sub", "super", "over", "under", "cross", "co", "pre",
  "post", "re", "de", "un", "semi", "pseudo", "quasi", "anti",
];

const PREMIUM_ROOTS = [
  "core", "labs", "node", "wave", "loop", "flux", "form", "stack",
  "grid", "pulse", "field", "mesh", "cell", "byte", "sense", "cast",
  "scope", "tide", "spark", "drift", "shift", "axis", "orbit", "vector",
  "link", "sync", "flow", "base", "gate", "path", "port", "hub",
  "edge", "line", "mark", "mint", "nest", "peak", "pit", "plan",
  "plot", "pod", "point", "rack", "rail", "ray", "reef", "ring",
  "root", "route", "row", "run", "scale", "seal", "seat", "seed",
  "set", "side", "sign", "site", "skill", "slot", "smart", "snap",
  "sort", "span", "spec", "spin", "spot", "spread", "stem", "step",
  "stone", "store", "stream", "stride", "strip", "sum", "swap",
  "tag", "tap", "task", "team", "term", "text", "tick", "tile",
  "tip", "tool", "top", "track", "trail", "trait", "tree", "trend",
  "trip", "trunk", "tube", "turn", "type", "unit", "use", "vault",
  "view", "vine", "void", "volt", "walk", "wall", "web", "wire",
  "work", "world", "wrap", "yard", "zone",
];

// ─────────────────────────────────────────────
// COLOR-TECH — expanded
// ─────────────────────────────────────────────
const COLOR_TECH = [
  "lumi", "vivid", "prism", "aqua", "ember", "azure", "indigo", "amber",
  "ivory", "neon", "violet", "crimson", "ochre", "saffron", "onyx",
  "obsid", "ceru", "coral", "olive", "opal", "perl", "ruby", "sage",
  "slate", "teal", "umber", "jade", "topaz", "garnet", "sepia",
  "cobalt", "sienna", "khaki", "ecru", "fawn", "lilac", "mauve",
  "peach", "plum", "rose", "taupe", "tawny", "virid",
];

// ─────────────────────────────────────────────
// SHORT SUFFIX
// ─────────────────────────────────────────────
const SHORT_TECH_SUFFIX = [
  "ly", "io", "ai", "ix", "xa", "ox", "us", "or", "yx", "el", "an", "ex",
  "ik", "ak", "ok", "uk", "ek", "il", "al", "ul", "ol", "it", "at",
  "ot", "ut", "et", "ib", "ab", "ob", "ub", "eb", "ic", "ac", "oc",
  "uc", "ec", "if", "af", "of", "uf", "ef", "ig", "ag", "og", "ug",
];

// ─────────────────────────────────────────────
// BRANDABLE CVCV / generators
// ─────────────────────────────────────────────
function genCVCV(rng: () => number): string {
  const c1 = pick(PRIMARY_CONS, rng);
  const v1 = pick(VOWELS_LIST, rng);
  const c2 = pick(PRIMARY_CONS, rng);
  const v2 = pick(VOWELS_LIST, rng);
  return `${c1}${v1}${c2}${v2}`;
}

function genCVCVC(rng: () => number): string {
  return genCVCV(rng) + pick(PRIMARY_CONS, rng);
}

function genCVCCV(rng: () => number): string {
  const c1 = pick(PRIMARY_CONS, rng);
  const v1 = pick(VOWELS_LIST, rng);
  const c2 = pick(PRIMARY_CONS, rng);
  let c3 = pick(PRIMARY_CONS, rng);
  while (c3 === c2) c3 = pick(PRIMARY_CONS, rng);
  const v2 = pick(VOWELS_LIST, rng);
  return `${c1}${v1}${c2}${c3}${v2}`;
}

export function generateBrandableCVCV(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 30) {
    attempts++;
    const r = rng();
    let name: string;
    if (r < 0.4) name = genCVCV(rng);
    else if (r < 0.75) name = genCVCVC(rng);
    else name = genCVCCV(rng);
    if (!hasAwkwardCluster(name) && isClean(name)) out.add(name);
  }
  return Array.from(out);
}

export function generateFutureSuffix(
  category: string,
  trendKeywords: string[],
  count: number,
  seed = Date.now(),
): string[] {
  const rng = makeRng(seed);
  const suffixes = FUTURE_SUFFIXES[category] ?? FUTURE_SUFFIXES.ai!;
  const prefixes = FUTURE_PREFIXES[category] ?? FUTURE_PREFIXES.ai!;
  const seeds = [
    ...prefixes,
    ...trendKeywords.map((k) => k.toLowerCase().replace(/[^a-z]/g, "")),
  ].filter((s) => s.length >= 2 && s.length <= 7);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 40) {
    attempts++;
    const r = rng();
    let candidate: string;
    const useMorph = rng() < 0.4;
    if (r < 0.5) {
      const root = pick(seeds, rng);
      const suf = pick(suffixes, rng);
      candidate = (root + suf).slice(0, 9);
    } else {
      const pre = pick(prefixes, rng).slice(0, 5);
      const suf = pick(suffixes, rng);
      candidate = (pre + suf).slice(0, 9);
    }
    if (useMorph) candidate = morphed(candidate, rng, 1);
    candidate = candidate.replace(/[^a-z]/g, "");
    if (!hasAwkwardCluster(candidate) && candidate.length >= 5 && isClean(candidate))
      out.add(candidate);
  }
  return Array.from(out);
}

export function generateDictionaryHack(
  trendKeywords: string[],
  count: number,
  seed = Date.now(),
): string[] {
  const rng = makeRng(seed);
  const power = ["ai", "deep", "core", "lab", "hub", "go", "io", "x", "now", "fy", "ly", "iq", "bit", "bot", "nix", "vex", "max", "box", "pod"];
  const seeds = trendKeywords
    .map((k) => k.toLowerCase().replace(/[^a-z]/g, ""))
    .filter((s) => s.length >= 3 && s.length <= 6);
  if (seeds.length === 0) seeds.push("logic", "mind", "core", "wave", "flux", "node");
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 40) {
    attempts++;
    const a = pick(seeds, rng);
    const b = pick(power, rng);
    const r = rng();
    let candidate = (r < 0.5 ? a + b : b + a).slice(0, 12);
    if (rng() < 0.3) candidate = morphed(candidate, rng, 1);
    if (!hasAwkwardCluster(candidate) && candidate.length >= 4 && isClean(candidate))
      out.add(candidate);
  }
  return Array.from(out);
}

export function generateTransliteration(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 50) {
    attempts++;
    const root = pick(TRANSLIT_ROOTS, rng);
    const suf = pick(TRANSLIT_SUFFIXES, rng);
    let candidate = (root + suf).toLowerCase();
    // Always morph to break through history saturation
    const morphOps = rng() < 0.6 ? 1 : 2;
    candidate = morphed(candidate, rng, morphOps);
    candidate = candidate.slice(0, 12);
    if (!hasAwkwardCluster(candidate) && candidate.length >= 5 && isClean(candidate))
      out.add(candidate);
  }
  return Array.from(out);
}

export function generateFourLetter(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  const digits = "0123456789".split("");
  while (out.size < count && attempts < count * 40) {
    attempts++;
    const pattern = rng() < 0.5 ? "LNLL" : "LLNL";
    let s = "";
    for (const ch of pattern) {
      if (ch === "L") s += pick(CONSONANTS.concat(VOWELS_LIST), rng);
      else s += pick(digits, rng);
    }
    if (!hasAwkwardCluster(s.replace(/[0-9]/g, "")) && isClean(s)) out.add(s);
  }
  return Array.from(out);
}

export function generatePrefixRoot(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 50) {
    attempts++;
    const p = pick(PREMIUM_PREFIXES, rng);
    const r = pick(PREMIUM_ROOTS, rng);
    let candidate = (p + r).toLowerCase();
    // Morphing critical for history-saturated strategies
    const morphOps = rng() < 0.5 ? 1 : rng() < 0.5 ? 2 : 0;
    if (morphOps > 0) candidate = morphed(candidate, rng, morphOps);
    candidate = candidate.replace(/[^a-z]/g, "");
    if (
      candidate.length >= 5 &&
      candidate.length <= 9 &&
      !hasAwkwardCluster(candidate) &&
      isClean(candidate)
    )
      out.add(candidate);
  }
  return Array.from(out);
}

export function generateColorTech(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 50) {
    attempts++;
    const c = pick(COLOR_TECH, rng);
    const r = pick(PREMIUM_ROOTS, rng);
    let candidate = (c + r).toLowerCase();
    const morphOps = rng() < 0.5 ? 1 : rng() < 0.5 ? 2 : 0;
    if (morphOps > 0) candidate = morphed(candidate, rng, morphOps);
    candidate = candidate.replace(/[^a-z]/g, "");
    if (
      candidate.length >= 5 &&
      candidate.length <= 9 &&
      !hasAwkwardCluster(candidate) &&
      isClean(candidate)
    )
      out.add(candidate);
  }
  return Array.from(out);
}

export function generateVowelStart(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 30) {
    attempts++;
    const len = 5 + Math.floor(rng() * 3); // 5..7
    let s = pick(VOWELS_LIST, rng);
    for (let i = 1; i < len; i++) {
      s += isVowel(s[s.length - 1] ?? "")
        ? pick(PRIMARY_CONS, rng)
        : pick(VOWELS_LIST.concat(PRIMARY_CONS), rng);
    }
    if (!hasAwkwardCluster(s) && isClean(s)) out.add(s);
  }
  return Array.from(out);
}

export function generatePortmanteau(
  trendKeywords: string[],
  count: number,
  seed = Date.now(),
): string[] {
  if (trendKeywords.length < 2) return [];
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 40) {
    attempts++;
    const a = pick(trendKeywords, rng).toLowerCase();
    const b = pick(trendKeywords, rng).toLowerCase();
    if (a === b) continue;
    const splitA = 1 + Math.floor(rng() * Math.max(1, a.length - 1));
    const splitB = 1 + Math.floor(rng() * Math.max(1, b.length - 1));
    let candidate = (a.slice(0, splitA) + b.slice(splitB)).toLowerCase();
    if (rng() < 0.35) candidate = morphed(candidate, rng, 1);
    candidate = candidate.replace(/[^a-z]/g, "");
    if (
      candidate.length >= 5 &&
      candidate.length <= 10 &&
      !hasAwkwardCluster(candidate) &&
      isClean(candidate)
    )
      out.add(candidate);
  }
  return Array.from(out);
}

export function generateShortSuffix(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 50) {
    attempts++;
    const root = pick(PREMIUM_ROOTS.concat(COLOR_TECH), rng);
    const suf = pick(SHORT_TECH_SUFFIX, rng);
    let candidate = (root + suf).toLowerCase();
    const morphOps = rng() < 0.5 ? 1 : 0;
    if (morphOps > 0) candidate = morphed(candidate, rng, morphOps);
    candidate = candidate.replace(/[^a-z]/g, "");
    if (
      candidate.length >= 5 &&
      candidate.length <= 9 &&
      !hasAwkwardCluster(candidate) &&
      isClean(candidate)
    )
      out.add(candidate);
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────
// TWO-WORD BRANDABLE — real dictionary words fused into 5-7 letter gems
// e.g. deepmind, novanet, swiftai, vaultix, primelab
// ─────────────────────────────────────────────
const WORD1_POWER = [
  // Action / movement
  "swift", "bold", "pure", "peak", "flux", "nova", "apex", "core",
  "deep", "edge", "high", "open", "true", "base", "beam", "leap",
  "sharp", "smart", "bright", "clear", "fast", "keen", "wide",
  // Nature / elements
  "sun", "sky", "sea", "fire", "wave", "wind", "rock", "root",
  "leaf", "seed", "star", "moon", "glow", "dawn", "dusk", "mist",
  // Premium feel
  "prime", "gem", "rare", "rich", "fine", "gilt", "gold", "mint",
  "pure", "silk", "zen", "key", "neo", "arc", "ace", "era",
  // Tech signals
  "bit", "byte", "code", "data", "grid", "hub", "ion", "lab",
  "net", "node", "ray", "sync", "vec", "web", "ai", "log",
];

const WORD2_POWER = [
  // Company endings
  "lab", "labs", "hub", "hq", "co", "io",
  // Tech roots
  "core", "node", "flux", "grid", "sync", "wave", "link", "path",
  "base", "gate", "port", "mesh", "loop", "edge", "flow", "stack",
  "byte", "bit", "kit", "bot", "ify", "ize", "ify",
  // Brandable endings
  "ify", "ize", "zen", "ven", "gen", "len", "den", "pen",
  "lex", "vex", "nex", "rex", "hex", "tex", "flex",
  "ara", "era", "ira", "ora", "ura",
  "ify", "ble", "tic", "ric", "nic", "mic",
  "mind", "view", "way", "bay", "ray", "day",
  "ry", "ly", "vy", "py", "ty", "gy",
];

export function generateTwoWordBrandable(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 60) {
    attempts++;
    const w1 = pick(WORD1_POWER, rng);
    const w2 = pick(WORD2_POWER, rng);
    // fuse: try full concat and truncated versions
    const fused = (w1 + w2).toLowerCase().replace(/[^a-z]/g, "");
    const candidates = [
      fused,
      fused.slice(0, 7),
      // Drop last vowel of w1 if makes it shorter
      ...(isVowel(w1[w1.length - 1] ?? "") ? [(w1.slice(0, -1) + w2).slice(0, 7)] : []),
    ];
    for (const candidate of candidates) {
      if (
        candidate.length >= 5 &&
        candidate.length <= 7 &&
        /^[a-z]+$/.test(candidate) &&
        !hasAwkwardCluster(candidate) &&
        isClean(candidate)
      ) {
        out.add(candidate);
        if (out.size >= count) break;
      }
    }
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────
// PRONOUNCEABLE REAL WORDS — dictionary-style names
// actual recognizable English words that happen to be 5-7 letters
// ─────────────────────────────────────────────
const PRONOUNCEABLE_BASES = [
  // Strong 5-letter real words
  "alter", "ambit", "axiom", "blaze", "blend", "bloom", "bound", "brave",
  "break", "brief", "brisk", "broad", "build", "burst", "clean", "clear",
  "climb", "craft", "crest", "crisp", "cross", "crown", "curve", "cycle",
  "delta", "dense", "depth", "digit", "draft", "drift", "drive", "drone",
  "elite", "ember", "empower", "epoch", "evoke", "exact", "exalt",
  "flair", "flame", "flare", "flash", "fleet", "float", "focus", "forge",
  "forth", "frame", "fresh", "front", "frost", "froze",
  "globe", "glyph", "grace", "grade", "grant", "grasp", "graze", "grind",
  "grove", "guard", "guide", "guild",
  "haven", "helix", "hinge", "hoist", "hyper",
  "ideal", "image", "imply", "index", "infer", "inter", "intro",
  "karma", "krypt",
  "lance", "laser", "layer", "learn", "ledge", "light", "limit", "local",
  "logic", "lotus", "loyal", "lucid", "lunar", "lusty",
  "magic", "maker", "maple", "match", "medic", "merge", "merit", "model",
  "morph", "mount", "mover", "myrrh",
  "nexus", "noble", "north", "notch",
  "octal", "optic", "orbit", "order", "ought",
  "panel", "parse", "patch", "petal", "phase", "pilot", "pixel", "pivot",
  "place", "plain", "plane", "plant", "plaza", "polar", "power", "prime",
  "prism", "proof", "prose", "proud", "pulse",
  "quant", "query", "quest", "quick",
  "radar", "radio", "raise", "range", "rapid", "ratio", "reach", "realm",
  "relay", "repro", "reset", "ridge", "rigel", "rivet", "rogue",
  "scale", "scene", "scout", "scythe", "serum", "seven", "shade", "shaft",
  "shale", "shift", "shore", "sigma", "sight", "sigma", "signal", "silex",
  "slate", "sleek", "slide", "slope", "smart", "solar", "solid", "solve",
  "sonic", "sonar", "spark", "speed", "spend", "spire", "split", "spore",
  "squad", "stage", "stake", "steel", "stern", "store", "storm", "story",
  "strap", "stray", "strip", "style", "surge", "synth",
  "tapir", "tempo", "terra", "theta", "three", "trace", "track",
  "trade", "trail", "trait", "triad", "tribe", "tried", "trust",
  "ultra", "unity", "uplift", "urban",
  "valid", "valor", "value", "vault", "venom", "verve", "visor", "vista",
  "vital", "vivid", "vocal", "voice", "voila", "volts",
  "watch", "weave", "wedge", "whole", "wider",
  "xenon", "xerox",
  "yield", "young",
  "zeal", "zeist", "zephyr", "zilch", "zippy", "zombi", "zonal",
  // 6-letter gems
  "advent", "agile", "alpine", "altair", "ampere", "amulet", "anchor",
  "annex", "antler", "arcane", "arcing", "ardent", "argent", "aright",
  "artery", "astral", "atomic", "attain", "augment",
  "beacon", "binary", "biosyn", "blazer", "blazon", "bonded", "bonsai",
  "bridge", "bright", "brigand",
  "canopy", "carbon", "cellar", "cement", "cipher", "citadel", "citrus",
  "cobalt", "codify", "collab", "comet", "compel", "convex", "copper",
  "corona", "cortex", "cosmic", "credit", "cursor",
  "darken", "define", "deploy", "design", "detect", "devote", "direct",
  "domain", "domino", "dynamo",
  "efface", "effect", "effort", "embark", "enable", "engage", "enigma",
  "enrich", "entire", "evolve", "exceed", "expand", "export", "extend",
  "extol",
  "fathom", "ferret", "filter", "finesse", "floret", "flumen", "format",
  "fossil", "fractil", "fractal", "fusion",
  "galena", "garden", "garner", "gather", "gemini", "gentle", "global",
  "goblin", "gothic", "gravis",
  "harbor", "hardex", "herald", "heron", "holism", "hybrid",
  "ignite", "impact", "import", "improv", "input", "instal", "intact",
  "intuit", "invent",
  "jetset", "jitter", "joiner", "journey",
  "kaleid", "kaizen", "kernel", "kindra", "kinect",
  "lancer", "lander", "legend", "liftup", "linear", "linker", "liquid",
  "lumens", "lumina", "luminex",
  "magnet", "marine", "marker", "matrix", "mentor", "meteor", "method",
  "metric", "midway", "mirror", "mobile", "modular", "molten", "mortem",
  "motion", "motive", "murmur", "mutant",
  "narian", "neural", "nimbus", "notion",
  "object", "obtain", "octane", "offset", "online", "opener", "operon",
  "oracle", "orange", "origin", "outrun",
  "parcel", "patent", "paxion", "permit", "petrol", "photon", "pillar",
  "pinion", "planet", "plasma", "platen", "playon", "pledge", "plugin",
  "podium", "pollex", "portal", "poster", "potent", "precis", "prefix",
  "premia", "premix", "preset", "proton", "proven",
  "quasar", "quorum",
  "radial", "radius", "raider", "random", "rankle", "recall", "refine",
  "reform", "render", "retype", "reveal", "revert", "ridley", "rigour",
  "ringet", "rocket", "router", "runner",
  "scalar", "schema", "sector", "select", "sensor", "series", "server",
  "signal", "simple", "sintra", "sketch", "soften", "solver", "source",
  "sphinx", "spiral", "sprint", "stable", "static", "status", "stoker",
  "stream", "strict", "stride", "string", "strobe", "struct", "studio",
  "submit", "subtle", "summit", "supply", "switch", "symbol", "system",
  "target", "tensor", "thrive", "ticket", "toggle", "tokeni", "torque",
  "tracer", "trance", "transit", "triple", "triton", "tunnel", "turbin",
  "united", "update", "uplink", "upside", "usable",
  "vector", "vendor", "verify", "vertex", "virago", "virtue", "vision",
  "visitor", "visual", "vortex",
  "wayfar", "widget", "winter", "wisdom",
  "xylite", "xylene",
  "yantra", "yonder",
  "zaftig", "zealis", "zenith", "zephyr",
];

export function generatePronounceableWord(count: number, seed = Date.now()): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 30) {
    attempts++;
    const base = pick(PRONOUNCEABLE_BASES, rng);
    // keep pure base if 5-7 letters, else try truncation / light morph
    const variants: string[] = [];
    if (base.length >= 5 && base.length <= 7) variants.push(base);
    if (base.length > 7) variants.push(base.slice(0, 7), base.slice(0, 6), base.slice(0, 5));
    // Optionally fuse with a 2-3 letter power ending
    const endings = ["ix", "ax", "ex", "ox", "ux", "io", "ai", "iq", "ly", "ry"];
    if (base.length <= 5) variants.push((base + pick(endings, rng)).slice(0, 7));
    for (const v of variants) {
      const clean = v.toLowerCase().replace(/[^a-z]/g, "");
      if (
        clean.length >= 5 &&
        clean.length <= 7 &&
        !hasAwkwardCluster(clean) &&
        isClean(clean)
      ) {
        out.add(clean);
        if (out.size >= count) break;
      }
    }
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────
// TWO-WORD REAL — meaningful 2-word .com domains from real dictionary words
// e.g. fastpay, cleanair, deepmind, goldmine, boldmove
// These are the HIGH-VALUE domains that sell for $10K-$500K+
// ─────────────────────────────────────────────

// All W1 pools (adjectives, verbs, nature words)
const REAL_W1_POOLS = [ADJ_SHORT, VERB_SHORT, NATURE_W1];
// All W2 pools (business, tech, finance, health nouns)
const REAL_W2_POOLS = [NOUN_BIZ, NOUN_TECH, NOUN_FIN, NOUN_HEALTH];

export function generateTwoWordReal(
  count: number,
  seed = Date.now(),
  maxLen = 12,
  minLen = 6,
): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  let attempts = 0;
  while (out.size < count && attempts < count * 80) {
    attempts++;
    const w1Pool = pick(REAL_W1_POOLS, rng);
    const w2Pool = pick(REAL_W2_POOLS, rng);
    const w1 = pick(w1Pool, rng);
    const w2 = pick(w2Pool, rng);
    if (w1 === w2) continue;
    const fused = (w1 + w2).toLowerCase();
    if (
      fused.length >= minLen &&
      fused.length <= maxLen &&
      /^[a-z]+$/.test(fused) &&
      !hasAwkwardCluster(fused) &&
      isClean(fused)
    ) {
      out.add(fused);
    }
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────
// NEWS-DRIVEN 2-WORD — combines trending news keywords with real words
// e.g. if "fusion" is trending → fusionlab, fusionpay, deepfusion
// ─────────────────────────────────────────────
export function generateNewsDriven(
  trendKeywords: string[],
  count: number,
  seed = Date.now(),
): string[] {
  const rng = makeRng(seed);
  const out = new Set<string>();
  // Filter trend keywords to usable ones (3-7 chars, alpha only)
  const usable = trendKeywords
    .map((k) => k.toLowerCase().replace(/[^a-z]/g, ""))
    .filter((k) => k.length >= 3 && k.length <= 7);
  if (usable.length === 0) return [];

  // Power suffixes that work with any keyword
  const powerSuffixes = [
    "hub", "lab", "pay", "box", "kit", "net", "app",
    "now", "go", "pro", "ai", "io", "hq", "co",
    "flow", "mind", "link", "base", "cast", "spot",
    "zone", "path", "gate", "port", "view", "wire",
    "grid", "sync", "wave", "core", "edge", "data",
    "fund", "deal", "sale", "mart", "shop", "club",
  ];
  // Power prefixes
  const powerPrefixes = [
    "get", "my", "go", "try", "use", "hey",
    "top", "one", "all", "any", "new", "pro",
    "big", "fast", "open", "deep", "true", "real",
    "smart", "bold", "pure", "free", "safe", "next",
  ];

  let attempts = 0;
  while (out.size < count && attempts < count * 60) {
    attempts++;
    const kw = pick(usable, rng);
    const r = rng();
    let candidate: string;
    if (r < 0.5) {
      // keyword + suffix
      candidate = kw + pick(powerSuffixes, rng);
    } else if (r < 0.85) {
      // prefix + keyword
      candidate = pick(powerPrefixes, rng) + kw;
    } else {
      // keyword + keyword
      const kw2 = pick(usable, rng);
      if (kw === kw2) continue;
      candidate = kw + kw2;
    }
    candidate = candidate.toLowerCase();
    if (
      candidate.length >= 6 &&
      candidate.length <= 12 &&
      /^[a-z]+$/.test(candidate) &&
      !hasAwkwardCluster(candidate) &&
      isClean(candidate)
    ) {
      out.add(candidate);
    }
  }
  return Array.from(out);
}

export const ALL_STRATEGIES = [
  "two_word_real",
  "news_driven",
  "brandable_cvcv",
  "future_suffix",
  "dictionary_hack",
  "two_word_brandable",
  "pronounceable_word",
  "transliteration",
  "prefix_root",
  "color_tech",
  "vowel_start",
  "portmanteau",
  "short_suffix",
] as const;

// Length gate varies by strategy type.
// - Legacy brandable strategies: 5-7 letters
// - Two-word real / news-driven: 6-12 letters (real 2-word domains are longer)
const TWO_WORD_STRATEGIES = new Set(["two_word_real", "news_driven"]);

function passesGate(name: string, exclude?: Set<string>, strategy?: string): boolean {
  if (!name) return false;
  const isTwoWord = strategy ? TWO_WORD_STRATEGIES.has(strategy) : false;
  const minLen = isTwoWord ? 6 : 5;
  const maxLen = isTwoWord ? 12 : 7;
  if (name.length < minLen || name.length > maxLen) return false;
  if (!/^[a-z]+$/.test(name)) return false;
  if (!isClean(name)) return false;
  if (exclude && exclude.has(name)) return false;
  return true;
}

export function generate(
  strategy: string,
  category: string,
  trendKeywords: string[],
  count: number,
  seed = Date.now(),
  excludeNames?: Set<string>,
): string[] {
  const oversample = Math.max(count * 12, 1500);
  let raw: string[];
  switch (strategy) {
    case "two_word_real":
      raw = generateTwoWordReal(oversample, seed);
      break;
    case "news_driven":
      raw = generateNewsDriven(trendKeywords, oversample, seed);
      break;
    case "brandable_cvcv":
      raw = generateBrandableCVCV(oversample, seed);
      break;
    case "future_suffix":
      raw = generateFutureSuffix(category, trendKeywords, oversample, seed);
      break;
    case "dictionary_hack":
      raw = generateDictionaryHack(trendKeywords, oversample, seed);
      break;
    case "transliteration":
      raw = generateTransliteration(oversample, seed);
      break;
    case "prefix_root":
      raw = generatePrefixRoot(oversample, seed);
      break;
    case "color_tech":
      raw = generateColorTech(oversample, seed);
      break;
    case "vowel_start":
      raw = generateVowelStart(oversample, seed);
      break;
    case "portmanteau":
      raw = generatePortmanteau(trendKeywords, oversample, seed);
      break;
    case "short_suffix":
      raw = generateShortSuffix(oversample, seed);
      break;
    case "two_word_brandable":
      raw = generateTwoWordBrandable(oversample, seed);
      break;
    case "pronounceable_word":
      raw = generatePronounceableWord(oversample, seed);
      break;
    default:
      raw = generateBrandableCVCV(oversample, seed);
  }
  const fresh: string[] = [];
  const seenLocal = new Set<string>();
  for (const name of raw) {
    if (seenLocal.has(name)) continue;
    if (!passesGate(name, excludeNames, strategy)) continue;
    seenLocal.add(name);
    fresh.push(name);
    if (fresh.length >= count) break;
  }
  return fresh;
}

// Bulk in-memory generation: call generate() repeatedly with shifted seeds until
// the requested count is satisfied or we've burnt enough rounds.
export function generateBulk(
  strategy: string,
  category: string,
  trendKeywords: string[],
  count: number,
  seed: number,
  excludeNames?: Set<string>,
  maxRounds = 8,
): { names: string[]; evaluated: number } {
  const out: string[] = [];
  const seen = new Set<string>();
  let evaluated = 0;
  for (let r = 0; r < maxRounds && out.length < count; r++) {
    const round = generate(
      strategy,
      category,
      trendKeywords,
      count,
      (seed ^ (r * 0x9e3779b1)) >>> 0,
      excludeNames,
    );
    evaluated += Math.max(count * 12, 1500);
    for (const n of round) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      if (out.length >= count) break;
    }
  }
  return { names: out, evaluated };
}

export { isVowel, patternOf };
