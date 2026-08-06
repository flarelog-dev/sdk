/**
 * Bundled price table for AI models.
 *
 * All prices are USD per 1,000,000 tokens, sourced from public provider
 * pricing pages as of 2026-07. They WILL drift over time — users should
 * override via `AIInstrumentationConfig.priceOverrides` when accuracy
 * matters for billing-grade dashboards.
 *
 * The table is intentionally hand-maintained rather than fetched at
 * runtime: zero-dependency SDK, no network at module load, and prices
 * are a snapshot the user has accepted by installing this version.
 *
 * Conventions:
 * - `cachedInput` is the *discount* rate when the provider serves the
 *   prompt from cache (e.g. OpenAI's cached input tokens, Anthropic's
 *   cache_read_input_tokens).
 * - `cacheCreationInput` is Anthropic's cache-write rate (typically
 *   1.25× the regular input rate).
 * - `reasoning` is OpenAI's reasoning-token rate for o1/o3 series.
 * - When a model is missing, the cost calculator falls back to a
 *   provider-level default (the cheapest non-reasoning chat model).
 */

import type { PriceEntry, AIProvider } from "./types";

/**
 * The canonical price table. Keyed by model name (lowercase).
 *
 * Lookups are case-insensitive — the cost calculator normalizes before
 * lookup.
 */
export const PRICE_TABLE: Record<string, PriceEntry> = {
  // --- OpenAI - GPT-4o family ---
  "gpt-4o": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-2024-08-06": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-2024-11-20": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, output: 0.6, cachedInput: 0.075 },

  // --- OpenAI - o1 reasoning family ---
  "o1": { input: 15, output: 60, cachedInput: 7.5, reasoning: 60 },
  "o1-2024-12-17": { input: 15, output: 60, cachedInput: 7.5, reasoning: 60 },
  "o1-mini": { input: 1.1, output: 4.4, cachedInput: 0.55, reasoning: 4.4 },
  "o1-preview": { input: 15, output: 60, cachedInput: 7.5, reasoning: 60 },
  "o3": { input: 10, output: 40, cachedInput: 2.5, reasoning: 40 },
  "o3-mini": { input: 1.1, output: 4.4, cachedInput: 0.55, reasoning: 4.4 },

  // --- OpenAI - GPT-4.1 family ---
  "gpt-4.1": { input: 2, output: 8, cachedInput: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4, cachedInput: 0.025 },

  // --- OpenAI - legacy (still used in production) ---
  "gpt-4-turbo": { input: 10, output: 30, cachedInput: 5 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-8k": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5, cachedInput: 0.25 },
  "gpt-3.5-turbo-16k": { input: 3, output: 4 },

  // --- OpenAI - embeddings ---
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-ada-002": { input: 0.1, output: 0 },

  // --- OpenAI - image models (per-image, hack: store as per-1M-tokens ratio) ---
  // Image pricing doesn't fit the token model cleanly. We store $/image as
  // `input` and leave output at 0. The calculator knows to skip token math
  // for image operations.
  "dall-e-3": { input: 40, output: 0 }, // ~$0.04 per image at standard quality
  "dall-e-2": { input: 20, output: 0 }, // ~$0.02 per image

  // --- Anthropic - Claude 4 family ---
  "claude-opus-4-20250514": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-opus-4": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-sonnet-4-20250514": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-sonnet-4": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-haiku-4": { input: 1, output: 5, cachedInput: 0.1, cacheCreationInput: 1.25 },

  // --- Anthropic - Claude 3.7 family ---
  "claude-3-7-sonnet-20250219": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-7-sonnet": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-7-haiku-20250229": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },
  "claude-3-7-haiku": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },

  // --- Anthropic - Claude 3.5 family ---
  "claude-3-5-sonnet-20241022": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-5-sonnet-20240620": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },
  "claude-3-5-haiku": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },

  // --- Anthropic - Claude 3 (legacy) ---
  "claude-3-opus-20240229": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-3-opus": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-3-sonnet-20240229": { input: 3, output: 15 },

  // --- Cloudflare Workers AI ---
  // Workers AI pricing is per-neuron (not per-token); we approximate using
  // the published rates for the most common models. Real bills may differ.
  // See https://developers.cloudflare.com/workers-ai/platform/pricing/
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { input: 0.99, output: 0.99 },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast_v1": { input: 0.99, output: 0.99 },
  "@cf/meta/llama-3.1-8b-instruct": { input: 0.07, output: 0.07 },
  "@cf/meta/llama-3.1-8b-instruct-fast": { input: 0.07, output: 0.07 },
  "@cf/meta/llama-3.2-3b-instruct": { input: 0.11, output: 0.11 },
  "@cf/meta/llama-3.2-1b-instruct": { input: 0.04, output: 0.04 },
  "@cf/meta/llama-3-8b-instruct": { input: 0.07, output: 0.07 },
  "@cf/meta/mistral-7b-instruct-v0.1": { input: 0.07, output: 0.07 },
  "@hf/mistral/mistral-7b-instruct-v0.2": { input: 0.07, output: 0.07 },
  "@cf/qwen/qwen1.5-14b-chat-awq": { input: 0.28, output: 0.28 },
  "@cf/meta/llama-2-7b-chat-fp16": { input: 0.07, output: 0.07 },
  "@cf/mistral/mistral-small-3.1-24b-instruct": { input: 0.28, output: 0.28 },

  // --- Google Gemini ---
  "gemini-2.5-pro": { input: 1.25, output: 10, cachedInput: 0.31 },
  "gemini-2.5-flash": { input: 0.075, output: 0.3, cachedInput: 0.0188 },
  "gemini-2.5-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-1.5-pro": { input: 1.25, output: 5, cachedInput: 0.31 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
  "text-embedding-004": { input: 0.025, output: 0 },
  "gemini-embedding-exp-03-07": { input: 0.025, output: 0 },

  // --- Mistral ---
  "mistral-large-latest": { input: 2, output: 6 },
  "mistral-large-2411": { input: 2, output: 6 },
  "mistral-medium-latest": { input: 0.4, output: 4 },
  "mistral-small-latest": { input: 0.2, output: 0.6 },
  "mistral-small-24b-instruct-2501": { input: 0.1, output: 0.3 },
  "mistral-embed": { input: 0.1, output: 0 },
  "codestral-latest": { input: 0.3, output: 0.9 },
  "codestral-2501": { input: 0.3, output: 0.9 },
  "pixtral-large-latest": { input: 2, output: 6 },
  "pixtral-12b-2409": { input: 0.15, output: 0.15 },

  // --- Cohere ---
  "command-r-plus-08-2024": { input: 2.5, output: 10 },
  "command-r-plus": { input: 2.5, output: 10 },
  "command-r-08-2024": { input: 0.15, output: 0.6 },
  "command-r": { input: 0.15, output: 0.6 },
  "command-r7b-12-2024": { input: 0.0375, output: 0.15 },
  "embed-english-v3.0": { input: 0.1, output: 0 },
  "embed-multilingual-v3.0": { input: 0.1, output: 0 },
  "rerank-english-v3.0": { input: 2, output: 0 },
  "rerank-multilingual-v3.0": { input: 2, output: 0 },

  // --- OpenAI-compatible providers ---
  // DeepSeek
  "deepseek-chat": { input: 0.27, output: 1.1, cachedInput: 0.07 },
  "deepseek-reasoner": { input: 0.55, output: 2.19, cachedInput: 0.14, reasoning: 2.19 },

  // Together AI - Llama family (representative)
  "meta-llama/llama-3.3-70b-instruct-turbo": { input: 0.88, output: 0.88 },
  "meta-llama/llama-3.1-8b-instruct-turbo": { input: 0.18, output: 0.18 },

  // Groq
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
};

/**
 * Per-provider fallback prices — used when a specific model isn't in the
 * table. These are deliberately conservative (mid-range) so the dashboard
 * shows *something* rather than silently dropping cost data.
 */
export const PROVIDER_FALLBACK: Record<AIProvider, PriceEntry> = {
  openai: { input: 2.5, output: 10, cachedInput: 1.25 },
  anthropic: { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  workers_ai: { input: 0.5, output: 0.5 },
  vercel_ai_sdk: { input: 2.5, output: 10 },
  google: { input: 1.25, output: 5 },
  mistral: { input: 0.4, output: 4 },
  cohere: { input: 0.5, output: 1.5 },
  generic: { input: 1, output: 2 },
};

/**
 * Look up a price entry by model name (case-insensitive).
 * Returns `undefined` if the model is unknown and no provider fallback is
 * available.
 */
export function lookupPrice(
  model: string,
  provider: AIProvider,
  overrides?: Record<string, PriceEntry>
): PriceEntry | undefined {
  const key = model.toLowerCase().trim();

  // 1. User overrides (highest precedence)
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (k.toLowerCase().trim() === key) return v;
    }
  }

  // 2. Built-in table — exact match
  if (PRICE_TABLE[key]) return PRICE_TABLE[key];

  // 3. Built-in table — prefix match (handles dated snapshots like
  // "gpt-4o-2024-08-06" matching "gpt-4o" entry even if we missed the date).
  // Only match if the lookup key is LONGER than the table key (forward match),
  // never the reverse — otherwise "gpt" would match every GPT variant.
  for (const [tableKey, entry] of Object.entries(PRICE_TABLE)) {
    if (key.length > tableKey.length && key.startsWith(tableKey)) {
      return entry;
    }
  }

  // 4. Provider fallback
  return PROVIDER_FALLBACK[provider];
}
