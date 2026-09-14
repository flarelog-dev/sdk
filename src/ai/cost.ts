/**
 * Cost calculator — converts a token-usage record + model name into USD.
 *
 * Zero-allocation, zero-dependency. Pure function. Safe to call from hot
 * paths and Workers (no global state, no async).
 */

import type { AITokenUsage, AIProvider, AIOperation } from "./types";
import { lookupPrice } from "./cost-table";

/**
 * Compute the USD cost of a single AI call.
 *
 * Returns `undefined` when:
 * - the model is unknown AND the provider has no fallback (shouldn't happen
 *   since we always define a fallback, but defensive)
 * - all token fields are zero/undefined (no point emitting a $0.0000 cost)
 *
 * The result is rounded to 8 decimal places to avoid float-precision noise
 * in dashboards (e.g. 0.0001234000000001 → 0.00012340).
 *
 * Counter semantics: for OpenAI-style providers, `usage.input` (prompt_tokens)
 * INCLUDES `usage.cachedInput`, and `usage.output` (completion_tokens) INCLUDES
 * `usage.reasoning` — the subsets are subtracted before billing so tokens are
 * never charged twice. Anthropic reports disjoint counters and is billed as-is.
 *
 * @param model   Model name as returned by the provider.
 * @param provider Provider name (for fallback price lookup).
 * @param usage   Token usage breakdown.
 * @param operation Operation type. Image ops use per-image pricing, not per-token.
 * @param overrides Optional user-provided price overrides.
 * @param multiplier Multiplier applied to the final cost (default 1.0).
 */
export function computeCost(
  model: string,
  provider: AIProvider,
  usage: AITokenUsage,
  operation: AIOperation,
  overrides?: Record<string, import("./types").PriceEntry>,
  multiplier = 1
): number | undefined {
  // Image operations don't fit the per-token model — bail out and let the
  // caller attach the per-image cost directly if they want.
  if (operation === "image") return undefined;

  const price = lookupPrice(model, provider, overrides);
  if (!price) return undefined;

  // Per-1M-token rate → per-token rate. Divide by 1_000_000.
  const PER_MILLION = 1_000_000;

  let cost = 0;

  const cachedInput = usage.cachedInput ?? 0;
  const cacheCreation = usage.cacheCreationInput ?? 0;
  const reasoning = usage.reasoning ?? 0;

  // OpenAI-style providers (including OpenAI-compatible gateways and the
  // catalog providers, which all reuse the OpenAI parser) report INCLUSIVE
  // counters: `prompt_tokens` already contains `cached_tokens`, and
  // `completion_tokens` already contains `reasoning_tokens`. Billing both
  // the total and the subset would double-count. Anthropic reports
  // DISJOINT counters (`input_tokens` excludes cache_read/cache_creation,
  // and there is no separate reasoning field), so no subtraction applies.
  const inclusive = provider !== "anthropic";
  const freshInput = Math.max(0, (usage.input ?? 0) - (inclusive ? cachedInput : 0));
  const plainOutput = Math.max(0, (usage.output ?? 0) - (inclusive ? reasoning : 0));

  cost += (freshInput * price.input) / PER_MILLION;

  if (cachedInput > 0 && price.cachedInput !== undefined) {
    cost += (cachedInput * price.cachedInput) / PER_MILLION;
  } else if (cachedInput > 0) {
    // Provider returned cached tokens but we don't have a cached rate —
    // fall back to the regular input rate (conservative: slight overcount).
    cost += (cachedInput * price.input) / PER_MILLION;
  }

  if (cacheCreation > 0 && price.cacheCreationInput !== undefined) {
    cost += (cacheCreation * price.cacheCreationInput) / PER_MILLION;
  } else if (cacheCreation > 0) {
    // No cache-write rate defined — bill at 1.25× input (Anthropic default).
    cost += (cacheCreation * price.input * 1.25) / PER_MILLION;
  }

  // Output tokens — excluding reasoning tokens for inclusive providers
  // (reasoning is a subset of `output` and billed separately below).
  if (plainOutput > 0) {
    cost += (plainOutput * price.output) / PER_MILLION;
  }

  // Reasoning tokens — billed at output rate by default, but o1/o3 series
  // has explicit reasoning rates.
  if (reasoning > 0) {
    const reasoningRate = price.reasoning ?? price.output;
    cost += (reasoning * reasoningRate) / PER_MILLION;
  }

  // Apply multiplier
  cost *= multiplier;

  // Don't emit a $0 cost when there were genuinely no tokens — that's noise.
  if (cost === 0 && freshInput === 0 && plainOutput === 0 && cachedInput === 0 && reasoning === 0 && cacheCreation === 0) {
    return undefined;
  }

  // Round to 8 decimal places to kill float noise.
  return Math.round(cost * 1e8) / 1e8;
}

/**
 * Format a cost as a human-readable USD string.
 * e.g. 0.0001234 → "$0.00012", 1.5 → "$1.50", 0 → "$0.00"
 *
 * Used for log messages and console output. The dashboard does its own
 * formatting — this is just for human-facing strings.
 */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
