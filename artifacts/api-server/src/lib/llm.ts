import { logger } from "./logger";

/**
 * Unified LLM client. Talks to an OpenAI-compatible chat-completions endpoint.
 *
 * Provider priority:
 *   1. GitHub Models  (uses the user's GitHub token — no extra cost)
 *   2. Groq           (only if GROQ_API_KEY is set)
 *
 * If no provider is configured (or all are circuit-broken), callers should fall
 * back to their own static/curated data. This module never throws to callers;
 * it returns `null` so the caller can decide what to do.
 */

interface ProviderConfig {
  name: string;
  url: string;
  apiKey: string;
  model: string;
}

const GITHUB_MODELS_URL = "https://models.github.ai/inference/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Default models. Override via env if needed.
const DEFAULT_GITHUB_MODEL = process.env.GITHUB_MODELS_MODEL ?? "openai/gpt-4o-mini";
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

/**
 * Preferred model for cheap/fast CANDIDATE GENERATION (LLM_GENERATOR_MODEL).
 * Returns `undefined` when unset so callers keep the active provider default.
 */
export function generatorModel(): string | undefined {
  const m = (process.env.LLM_GENERATOR_MODEL ?? "").trim();
  return m.length > 0 ? m : undefined;
}

/**
 * Preferred model for the strict final EVALUATION (LLM_EVALUATOR_MODEL).
 * Should point at the strongest configured model. Returns `undefined` when unset
 * so callers keep the active provider default. NOTE: the override only takes
 * effect if the active provider's endpoint actually serves that model id.
 */
export function evaluatorModel(): string | undefined {
  const m = (process.env.LLM_EVALUATOR_MODEL ?? "").trim();
  return m.length > 0 ? m : undefined;
}

// Provider health tracking:
//  - disabledProviders: PERMANENT for this process. Only auth/config errors
//    (401/403) land here — retrying cannot fix a bad/missing token.
//  - cooldownUntil: TEMPORARY. Transient errors (429 rate-limit, 5xx upstream
//    outage) park the provider for a short window, after which it is retried
//    automatically. A single rate-limit burst must NEVER kill the LLM for the
//    rest of a 24/7 process — that would silently drop every diamond down to
//    the conservative local gate and stop almost all Telegram alerts.
const disabledProviders = new Set<string>();
const cooldownUntil = new Map<string, number>();

// How long a rate-limited / transiently-failing provider sits out before it is
// tried again. Override with LLM_COOLDOWN_MS. Default: 10 minutes.
const LLM_COOLDOWN_MS = (() => {
  const raw = Number(process.env.LLM_COOLDOWN_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10 * 60 * 1000;
})();

function disableProvider(name: string, reason: string) {
  if (!disabledProviders.has(name)) {
    disabledProviders.add(name);
    logger.warn({ provider: name, reason }, "LLM provider disabled for this process");
  }
}

function cooldownProvider(name: string, ms: number, reason: string) {
  const until = Date.now() + ms;
  cooldownUntil.set(name, until);
  logger.warn(
    { provider: name, reason, cooldownMs: ms, retryAt: new Date(until).toISOString() },
    "LLM provider cooling down (will auto-retry)",
  );
}

/** True if a provider is usable now (not permanently disabled, no active cooldown). */
function providerAvailable(name: string): boolean {
  if (disabledProviders.has(name)) return false;
  const until = cooldownUntil.get(name);
  if (until != null) {
    if (Date.now() < until) return false;
    cooldownUntil.delete(name); // cooldown elapsed — clear and allow a retry
  }
  return true;
}

/**
 * Build the ordered list of usable providers from env, skipping disabled ones.
 * Honors optional `LLM_PROVIDER` to force a single provider ("github" | "groq").
 */
function resolveProviders(): ProviderConfig[] {
  const forced = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const githubKey = process.env.GITHUB_MODELS_TOKEN ?? "";
  const groqKey = process.env.GROQ_API_KEY ?? "";

  const all: ProviderConfig[] = [];
  if (githubKey) {
    all.push({ name: "github", url: GITHUB_MODELS_URL, apiKey: githubKey, model: DEFAULT_GITHUB_MODEL });
  }
  if (groqKey) {
    all.push({ name: "groq", url: GROQ_URL, apiKey: groqKey, model: DEFAULT_GROQ_MODEL });
  }

  const usable = all.filter((p) => providerAvailable(p.name));
  if (forced) return usable.filter((p) => p.name === forced);
  return usable;
}

/** True if at least one LLM provider is configured and not circuit-broken. */
export function llmAvailable(): boolean {
  return resolveProviders().length > 0;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatJSONOptions {
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  /**
   * Override the provider's default model for this single call (e.g. a stronger
   * evaluator model). Only effective if the active provider's endpoint serves
   * that model id; otherwise the provider falls back to its configured default.
   */
  model?: string;
}

/**
 * Run a chat completion that is expected to return a single JSON object, and
 * parse it. Tries each configured provider in order until one succeeds.
 * Returns the parsed object (typed by the caller) or `null` on total failure.
 */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  options: ChatJSONOptions = {},
): Promise<T | null> {
  const providers = resolveProviders();
  if (providers.length === 0) return null;

  const { temperature = 0.7, timeoutMs = 15000, maxTokens, model } = options;

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: model || provider.model,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          response_format: { type: "json_object" },
          messages,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        logger.warn(
          { provider: provider.name, status: response.status, body: txt.slice(0, 200) },
          "LLM provider error",
        );
        if (response.status === 401 || response.status === 403) {
          // Auth/config problem — retrying won't help until the operator fixes it.
          disableProvider(provider.name, `HTTP ${response.status}`);
        } else if (response.status === 429 || response.status >= 500) {
          // Transient (rate-limit or upstream outage) — park briefly, auto-retry.
          cooldownProvider(provider.name, LLM_COOLDOWN_MS, `HTTP ${response.status}`);
        }
        continue; // try next provider
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) continue;

      try {
        return JSON.parse(content) as T;
      } catch {
        // Some models wrap JSON in prose/fences despite json mode — try to salvage.
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return JSON.parse(match[0]) as T;
          } catch {
            /* fall through */
          }
        }
        logger.warn({ provider: provider.name }, "LLM returned non-JSON content");
        continue;
      }
    } catch (err) {
      logger.warn({ provider: provider.name, err }, "LLM request failed");
      continue;
    }
  }

  return null;
}
