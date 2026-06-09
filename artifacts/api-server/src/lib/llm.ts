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

// Circuit breakers per provider: once a provider returns auth/quota errors we
// stop calling it for the rest of the process lifetime to avoid log spam and
// wasted latency.
const disabledProviders = new Set<string>();
function disableProvider(name: string, reason: string) {
  if (!disabledProviders.has(name)) {
    disabledProviders.add(name);
    logger.warn({ provider: name, reason }, "LLM provider disabled for this process");
  }
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

  const usable = all.filter((p) => !disabledProviders.has(p.name));
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

  const { temperature = 0.7, timeoutMs = 15000, maxTokens } = options;

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
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
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          disableProvider(provider.name, `HTTP ${response.status}`);
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
