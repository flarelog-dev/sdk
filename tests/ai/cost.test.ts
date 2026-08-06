/**
 * Tests for the cost calculator.
 */
import { describe, it, expect } from "vitest";
import { computeCost, formatCost } from "../../src/ai/cost";
import { lookupPrice, PRICE_TABLE } from "../../src/ai/cost-table";

describe("computeCost", () => {
  it("returns undefined when there are no tokens", () => {
    expect(computeCost("gpt-4o", "openai", {}, "chat")).toBeUndefined();
  });

  it("computes cost for a basic gpt-4o chat call", () => {
    // gpt-4o: $2.50/1M input, $10/1M output
    // 1000 input + 500 output = $0.0025 + $0.005 = $0.0075
    const cost = computeCost("gpt-4o", "openai", { input: 1000, output: 500 }, "chat");
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it("applies cached input discount", () => {
    // gpt-4o: $1.25/1M cached (vs $2.50 fresh)
    // 1000 cached = $0.00125
    const cost = computeCost("gpt-4o", "openai", { cachedInput: 1000 }, "chat");
    expect(cost).toBeCloseTo(0.00125, 6);
  });

  it("falls back to regular input rate when cached rate is missing", () => {
    // gpt-4 (legacy) has no cachedInput in the table
    // 1000 cached = $0.03 (treated as regular input)
    const cost = computeCost("gpt-4", "openai", { cachedInput: 1000 }, "chat");
    expect(cost).toBeCloseTo(0.03, 6);
  });

  it("applies cache-creation rate for Anthropic", () => {
    // claude-3-5-sonnet: $3 input, $3.75 cache-creation
    // 1000 cache creation = $0.00375
    const cost = computeCost(
      "claude-3-5-sonnet",
      "anthropic",
      { cacheCreationInput: 1000 },
      "chat"
    );
    expect(cost).toBeCloseTo(0.00375, 6);
  });

  it("falls back to 1.25x input for cache-creation when rate is missing", () => {
    // anthropic legacy model with no cacheCreationInput rate
    // 1000 cache creation at $3 input = $0.003 * 1.25 = $0.00375
    const cost = computeCost(
      "claude-3-sonnet-20240229",
      "anthropic",
      { cacheCreationInput: 1000 },
      "chat"
    );
    expect(cost).toBeCloseTo(0.00375, 6);
  });

  it("applies reasoning rate for o1", () => {
    // o1: $60/1M reasoning
    // 1000 reasoning = $0.06
    const cost = computeCost("o1", "openai", { reasoning: 1000 }, "chat");
    expect(cost).toBeCloseTo(0.06, 6);
  });

  it("uses output rate for reasoning when no explicit rate", () => {
    // Anthropic Claude doesn't have reasoning tokens, but if they appeared
    // we'd bill at the output rate
    // claude-3-5-sonnet: $15/1M output
    // 1000 reasoning = $0.015
    const cost = computeCost(
      "claude-3-5-sonnet",
      "anthropic",
      { reasoning: 1000 },
      "chat"
    );
    expect(cost).toBeCloseTo(0.015, 6);
  });

  it("combines all token types correctly", () => {
    // gpt-4o: $2.5 input, $1.25 cached, $10 output
    // gpt-4o has no explicit reasoning rate → falls back to output rate ($10)
    // 500 input + 200 cached + 300 output + 100 reasoning
    // = $0.00125 + $0.00025 + $0.003 + $0.001 = $0.0055
    const cost = computeCost(
      "gpt-4o",
      "openai",
      {
        input: 500,
        cachedInput: 200,
        output: 300,
        reasoning: 100,
      },
      "chat"
    );
    expect(cost).toBeCloseTo(0.0055, 6);
  });

  it("applies cost multiplier", () => {
    const cost = computeCost(
      "gpt-4o",
      "openai",
      { input: 1000, output: 500 },
      "chat",
      undefined,
      2
    );
    expect(cost).toBeCloseTo(0.015, 6); // 2x of $0.0075
  });

  it("returns undefined for image operations", () => {
    expect(
      computeCost("dall-e-3", "openai", { input: 1 }, "image")
    ).toBeUndefined();
  });

  it("uses provider fallback for unknown models", () => {
    // unknown model on openai → fallback $2.5/1M input
    const cost = computeCost("gpt-99-turbo", "openai", { input: 1000 }, "chat");
    expect(cost).toBeCloseTo(0.0025, 6);
  });

  it("respects user price overrides", () => {
    const overrides = {
      "custom-model": { input: 100, output: 200 },
    };
    const cost = computeCost(
      "custom-model",
      "openai",
      { input: 1000, output: 500 },
      "chat",
      overrides
    );
    // 1000 * $100/1M + 500 * $200/1M = $0.1 + $0.1 = $0.2
    expect(cost).toBeCloseTo(0.2, 6);
  });

  it("handles case-insensitive model lookup", () => {
    const cost = computeCost("GPT-4O", "openai", { input: 1000 }, "chat");
    expect(cost).toBeCloseTo(0.0025, 6);
  });

  it("matches dated snapshots via prefix", () => {
    // "gpt-4o-2024-08-06" is in the table, but if it weren't, the prefix
    // match would fall back to "gpt-4o".
    const cost = computeCost(
      "gpt-4o-some-future-snapshot-2026-01-01",
      "openai",
      { input: 1000 },
      "chat"
    );
    expect(cost).toBeCloseTo(0.0025, 6);
  });

  it("returns zero cost for embedding models (output only, no output)", () => {
    // text-embedding-3-small: $0.02/1M input, $0 output
    const cost = computeCost(
      "text-embedding-3-small",
      "openai",
      { input: 10000 },
      "embedding"
    );
    expect(cost).toBeCloseTo(0.0002, 7);
  });
});

describe("lookupPrice", () => {
  it("returns user overrides first", () => {
    const overrides = { "gpt-4o": { input: 999, output: 999 } };
    const price = lookupPrice("gpt-4o", "openai", overrides);
    expect(price?.input).toBe(999);
  });

  it("returns table entry for known model", () => {
    const price = lookupPrice("claude-3-5-sonnet", "anthropic");
    expect(price?.input).toBe(3);
    expect(price?.output).toBe(15);
    expect(price?.cachedInput).toBe(0.3);
  });

  it("returns provider fallback for unknown model", () => {
    const price = lookupPrice("totally-unknown-model", "anthropic");
    expect(price?.input).toBe(3);
    expect(price?.output).toBe(15);
  });
});

describe("formatCost", () => {
  it("formats zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats undefined", () => {
    expect(formatCost(undefined)).toBe("—");
  });

  it("formats tiny amounts", () => {
    expect(formatCost(0.0001234)).toBe("$0.00012");
  });

  it("formats sub-dollar amounts", () => {
    expect(formatCost(0.5)).toBe("$0.5000");
  });

  it("formats dollar amounts", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });

  it("formats large amounts", () => {
    expect(formatCost(1234.5)).toBe("$1234.50");
  });
});

describe("PRICE_TABLE sanity checks", () => {
  it("has entries for major OpenAI models", () => {
    expect(PRICE_TABLE["gpt-4o"]).toBeDefined();
    expect(PRICE_TABLE["gpt-4o-mini"]).toBeDefined();
    expect(PRICE_TABLE["o1"]).toBeDefined();
    expect(PRICE_TABLE["o3-mini"]).toBeDefined();
  });

  it("has entries for major Anthropic models", () => {
    expect(PRICE_TABLE["claude-opus-4"]).toBeDefined();
    expect(PRICE_TABLE["claude-sonnet-4"]).toBeDefined();
    expect(PRICE_TABLE["claude-3-5-sonnet"]).toBeDefined();
  });

  it("has entries for Cloudflare Workers AI", () => {
    expect(PRICE_TABLE["@cf/meta/llama-3.3-70b-instruct-fp8-fast"]).toBeDefined();
    expect(PRICE_TABLE["@cf/meta/llama-3.1-8b-instruct"]).toBeDefined();
  });

  it("Anthropic cache rates are sensible", () => {
    // Cached read should be cheaper than fresh input.
    const opus = PRICE_TABLE["claude-opus-4"];
    expect(opus.cachedInput).toBeLessThan(opus.input);
    // Cache creation should be more expensive than fresh input.
    expect(opus.cacheCreationInput).toBeGreaterThan(opus.input);
  });
});
