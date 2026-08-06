/**
 * Bundled price table for AI models.
 *
 * All prices are USD per 1,000,000 tokens, sourced from public provider
 * pricing pages as of 2026-08. They WILL drift over time — users should
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
 * - `cacheCreationInput` is Anthropic's cache-write rate.
 * - `reasoning` is OpenAI/DeepSeek reasoning-token rate.
 * - When a model is missing, the cost calculator falls back to a
 *   provider-level default (the cheapest non-reasoning chat model).
 */

import type { PriceEntry, AIProvider } from "./types";

/**
 * The canonical price table. Keyed by model name (lowercase).
 *
 * Lookups are case-insensitive — the cost calculator normalizes before lookup.
 */
export const PRICE_TABLE: Record<string, PriceEntry> = {
  // --- OpenAI - GPT-5 family (2026) ---
  "gpt-5": { input: 5.0, output: 20.0, cachedInput: 2.5 },
  "gpt-5-mini": { input: 0.30, output: 1.20, cachedInput: 0.15 },

  // --- OpenAI - GPT-4o family ---
  "gpt-4o": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-2024-08-06": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-2024-11-20": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, output: 0.6, cachedInput: 0.075 },

  // --- OpenAI - o1 / o3 reasoning family ---
  "o1": { input: 15, output: 60, cachedInput: 7.5, reasoning: 60 },
  "o1-2024-12-17": { input: 15, output: 60, cachedInput: 7.5, reasoning: 60 },
  "o1-mini": { input: 1.1, output: 4.4, cachedInput: 0.55, reasoning: 4.4 },
  "o1-preview": { input: 15, output: 60, cachedInput: 7.5, reasoning: 60 },
  "o3": { input: 10, output: 40, cachedInput: 2.5, reasoning: 40 },
  "o3-mini": { input: 1.1, output: 4.4, cachedInput: 0.55, reasoning: 4.4 },

  // --- OpenAI - legacy ---
  "gpt-4.1": { input: 2, output: 8, cachedInput: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
  "gpt-4-turbo": { input: 10, output: 30, cachedInput: 5 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5, cachedInput: 0.25 },

  // --- OpenAI - embeddings & images ---
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "dall-e-3": { input: 40, output: 0 }, // ~$0.04 per image (mapped to input)

  // --- Anthropic - Claude 4.5/4.6 family (2026) ---
  "claude-4-6-sonnet": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-4-5-sonnet": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },

  // --- Anthropic - Claude 4 family ---
  "claude-opus-4-20250514": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-opus-4": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-fable-4-20250720": { input: 10, output: 50, cachedInput: 1.0, cacheCreationInput: 12.5 },
  "claude-fable-4": { input: 10, output: 50, cachedInput: 1.0, cacheCreationInput: 12.5 },
  "claude-sonnet-4-20250514": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-sonnet-4": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-haiku-4": { input: 1, output: 5, cachedInput: 0.1, cacheCreationInput: 1.25 },

  // --- Anthropic - Claude 3.7 family ---
  "claude-3-7-sonnet-20250219": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-7-sonnet": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-7-haiku-20250229": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },
  "claude-3-7-haiku": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },

  // --- Anthropic - Claude 3.5 family ---
  "claude-3-5-opus-20241022": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-3-5-opus": { input: 15, output: 75, cachedInput: 1.5, cacheCreationInput: 18.75 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-5-sonnet": { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },
  "claude-3-5-haiku": { input: 0.8, output: 4, cachedInput: 0.08, cacheCreationInput: 1 },

  // --- Google Gemini ---
  "gemini-3.0-pro": { input: 1.50, output: 12.0, cachedInput: 0.38 },
  "gemini-3.0-flash": { input: 0.10, output: 0.40, cachedInput: 0.025 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cachedInput: 0.31 },
  "gemini-2.5-flash": { input: 0.075, output: 0.3, cachedInput: 0.0188 },
  "gemini-2.5-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-1.5-pro": { input: 1.25, output: 5, cachedInput: 0.31 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
  "text-embedding-004": { input: 0.025, output: 0 },

  // --- DeepSeek ---
  "deepseek-chat": { input: 0.27, output: 1.1, cachedInput: 0.07 },
  "deepseek-reasoner": { input: 0.55, output: 2.19, cachedInput: 0.14, reasoning: 2.19 },

  // --- Moonshot (Kimi) ---
  "kimi-k3": { input: 3.0, output: 15.0 },
  "kimi-k2.6": { input: 0.95, output: 4.0, cachedInput: 0.16 },
  "kimi-k2.5": { input: 0.60, output: 3.0, cachedInput: 0.10 },
  "moonshot-v1-8k": { input: 1.6, output: 1.6 },
  "moonshot-v1-32k": { input: 3.3, output: 3.3 },
  "moonshot-v1-128k": { input: 8.3, output: 8.3 },

  // --- Zhipu (GLM) ---
  "glm-4-plus": { input: 0.70, output: 0.70 },
  "glm-4.5-air": { input: 0.14, output: 0.86 },
  "glm-4-0520": { input: 14.0, output: 14.0 },

  // --- Mistral ---
  "mistral-large-latest": { input: 2, output: 6 },
  "mistral-small-latest": { input: 0.2, output: 0.6 },
  "codestral-latest": { input: 0.3, output: 0.9 },
  "pixtral-large-latest": { input: 2, output: 6 },
  
  // --- Cohere ---
  "command-r-plus-08-2024": { input: 2.5, output: 10 },
  "command-r-08-2024": { input: 0.15, output: 0.6 },
  "embed-english-v3.0": { input: 0.1, output: 0 },

  // --- Open Source / Llama Hosting (Cloudflare, Together, Groq) ---
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { input: 0.99, output: 0.99 },
  "@cf/meta/llama-3.1-8b-instruct": { input: 0.07, output: 0.07 },
  "meta-llama/llama-3.3-70b-instruct-turbo": { input: 0.88, output: 0.88 },
  "meta-llama/llama-3.1-8b-instruct-turbo": { input: 0.18, output: 0.18 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
};

/**
 * Per-provider fallback prices — used when a specific model isn't in the
 * table. These are deliberately conservative (mid-range).
 */
export const PROVIDER_FALLBACK: Record<AIProvider | "deepseek" | "moonshot" | "zhipu", PriceEntry> = {
  openai: { input: 2.5, output: 10, cachedInput: 1.25 },
  anthropic: { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
  google: { input: 1.25, output: 5 },
  deepseek: { input: 0.27, output: 1.1, cachedInput: 0.07 },
  moonshot: { input: 1.6, output: 1.6 },
  zhipu: { input: 0.7, output: 0.7 },
  workers_ai: { input: 0.5, output: 0.5 },
  vercel_ai_sdk: { input: 2.5, output: 10 },
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
  provider: keyof typeof PROVIDER_FALLBACK,
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

  // 3. Built-in table — prefix match (handles dated snapshots)
  // FIX: We MUST sort the keys by length descending.
  // Otherwise, if we search "gpt-4o-mini", it might hit "gpt-4o" first
  // and mistakenly apply the expensive $2.50 rate instead of the mini rate!
  const sortedKeys = Object.keys(PRICE_TABLE).sort((a, b) => b.length - a.length);
  
  for (const tableKey of sortedKeys) {
    // Only match if the lookup key is LONGER than the table key (forward match)
    // E.g., `gpt-4o-mini-01-01` matching against `gpt-4o-mini`
    if (key.length > tableKey.length && key.startsWith(tableKey)) {
      return PRICE_TABLE[tableKey];
    }
  }

  // 4. Provider fallback
  return PROVIDER_FALLBACK[provider] || PROVIDER_FALLBACK["generic"];
}