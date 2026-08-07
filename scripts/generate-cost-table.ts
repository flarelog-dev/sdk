#!/usr/bin/env node
/**
 * generate-cost-table.ts
 *
 * Regenerates `src/ai/cost-table.ts` from the opencode.ai model catalog:
 *   https://models.opencode.ai/catalog.json
 *
 * This is a BUILD-TIME tool. The SDK stays zero-dependency and makes no
 * network calls at runtime — run `npm run update-prices` to refresh the
 * bundled price table from the catalog.
 *
 *   npm run update-prices
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CATALOG_URL = "https://models.opencode.ai/catalog.json";

/**
 * Provider precedence — when a model id appears under multiple providers,
 * the first provider in this list wins. Primary vendors before community hosts.
 */
const PROVIDER_PRIORITY = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "xai",
  "mistral",
  "cohere",
  "moonshotai",
  "zhipu",
  "qwen",
  "meta",
  "amazon",
  "azure",
  "groq",
  "togetherai",
  "fireworks-ai",
  "openrouter",
  "cloudflare",
  "cloudflare-workers-ai",
  "huggingface",
];

interface CatalogModel {
  id?: string;
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
  limit?: { context?: number; output?: number };
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  modalities?: { input?: string[]; output?: string[] };
}

interface CatalogProvider {
  id?: string;
  name?: string;
  api?: string;
  npm?: string;
  models?: Record<string, CatalogModel>;
}

interface Catalog {
  models?: Record<string, CatalogModel>;
  providers?: Record<string, CatalogProvider>;
}

/**
 * Hardcoded hostnames for providers that don't expose an `api` field in the
 * catalog (the 25 or so backed by official AI SDK packages where the URL is
 * baked into the npm package).
 */
const HARDCODED_HOSTS: Record<string, string> = {
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  google: "generativelanguage.googleapis.com",
  groq: "api.groq.com",
  mistral: "api.mistral.ai",
  cohere: "api.cohere.com",
  xai: "api.x.ai",
  "amazon-bedrock": "bedrock-runtime.us-east-1.amazonaws.com",
  azure: "azure.com",
  "azure-cognitive-services": "cognitiveservices.azure.com",
  cerebras: "api.cerebras.ai",
  perplexity: "api.perplexity.ai",
  togetherai: "api.together.xyz",
  deepinfra: "api.deepinfra.com",
  venice: "api.venice.ai",
  gitlab: "gitlab.com",
  "cloudflare-ai-gateway": "gateway.ai.cloudflare.com",
  "merge-gateway": "api.merge.dev",
  "sap-ai-core": "api.ai.core.cloud.sap",
  qvac: "qvac.io",
  aihubmix: "api.aihubmix.com",
  "google-vertex": "us-central1-aiplatform.googleapis.com",
  "google-vertex-anthropic": "us-east5-aiplatform.googleapis.com",
  v0: "api.v0.dev",
  vercel: "api.vercel.com",
};

async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch(CATALOG_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch catalog: HTTP ${res.status}`);
  return (await res.json()) as Catalog;
}

function priceEntry(m: CatalogModel): string {
  const cost = m.cost!;
  const parts: string[] = [`input: ${cost.input ?? 0}`, `output: ${cost.output ?? 0}`];
  if (cost.cache_read !== undefined) parts.push(`cachedInput: ${cost.cache_read}`);
  if (cost.cache_write !== undefined) parts.push(`cacheCreationInput: ${cost.cache_write}`);
  if (m.limit?.context) parts.push(`contextWindow: ${m.limit.context}`);
  if (m.limit?.output) parts.push(`maxOutput: ${m.limit.output}`);
  if (m.reasoning !== undefined) parts.push(`hasReasoning: ${String(m.reasoning)}`);
  if (m.tool_call !== undefined) parts.push(`hasToolCall: ${String(m.tool_call)}`);
  if (m.attachment !== undefined) parts.push(`hasAttachment: ${String(m.attachment)}`);
  if (m.modalities?.input?.length) parts.push(`inputModalities: ${JSON.stringify(m.modalities.input)}`);
  if (m.modalities?.output?.length) parts.push(`outputModalities: ${JSON.stringify(m.modalities.output)}`);
  return `{ ${parts.join(", ")} }`;
}

/**
 * Extract the hostname from a provider's `api` URL.
 * Returns undefined for template-variable URLs (e.g. `${DATABRICKS_HOST}`).
 */
function extractHost(apiUrl: string): string | undefined {
  if (!apiUrl || apiUrl.includes("${")) return undefined;
  try {
    const u = new URL(apiUrl);
    return u.host.toLowerCase();
  } catch {
    return undefined;
  }
}

async function main() {
  console.log("[update-prices] fetching catalog…");
  const catalog = await fetchCatalog();

  // Dedupe: first provider (per priority) wins for a given lowercase model id.
  const table = new Map<string, CatalogModel>();
  for (const providerId of PROVIDER_PRIORITY) {
    const models = catalog.providers?.[providerId]?.models;
    if (!models) continue;
    for (const [modelId, modelDef] of Object.entries(models)) {
      if (!modelDef?.cost) continue;
      const key = modelId.toLowerCase().trim();
      if (!key || table.has(key)) continue;
      // Enrich capabilities from the canonical top-level model definition.
      const canonical =
        catalog.models?.[`${providerId}/${modelId}`] ??
        catalog.models?.[modelId] ??
        {};
      table.set(key, { ...canonical, cost: modelDef.cost });
    }
  }

  const keys = [...table.keys()].sort((a, b) => a.localeCompare(b));
  const body = keys.map((key) => `  ${JSON.stringify(key)}: ${priceEntry(table.get(key)!)},`).join("\n");

  // Build PROVIDER_HOSTS map: hostname -> provider id.
  const hostMap = new Map<string, string>();
  for (const providerId of PROVIDER_PRIORITY) {
    const provider = catalog.providers?.[providerId];
    if (!provider) continue;
    let host = provider.api ? extractHost(provider.api) : undefined;
    if (!host) host = HARDCODED_HOSTS[providerId];
    if (host) hostMap.set(host, providerId);
  }
  // Also check non-priority providers that have an api field.
  for (const [providerId, provider] of Object.entries(catalog.providers ?? {})) {
    if (hostMap.size > 0 && [...hostMap.values()].includes(providerId)) continue;
    const host = provider.api ? extractHost(provider.api) : HARDCODED_HOSTS[providerId];
    if (host && !hostMap.has(host)) hostMap.set(host, providerId);
  }

  const hostEntries = [...hostMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([host, providerId]) => `  ${JSON.stringify(host)}: ${JSON.stringify(providerId)},`)
    .join("\n");

  const now = new Date().toISOString();

  const FILE = `// GENERATED by scripts/generate-cost-table.ts — DO NOT EDIT manually.
// Source: opencode.ai model catalog (https://models.opencode.ai/catalog.json).
// Generated ${now}. Run \`npm run update-prices\` to refresh.
//
// All prices are USD per 1,000,000 tokens. Pricing may drift — override via
// \`AIInstrumentationConfig.priceOverride\` when accuracy matters.

import type { PriceEntry } from "./types";

/**
 * Model pricing keyed by lowercase model id. Prices per 1M tokens, with
 * optional capability metadata (context window, reasoning, tool call, modalities).
 */
export const PRICE_TABLE: Record<string, PriceEntry> = {
${body}
};

/**
 * Maps AI provider API hostnames to their catalog provider id.
 * Used by the fetch interceptor for runtime auto-detection of providers
 * (e.g. "openrouter.ai" -> "openrouter").
 */
export const PROVIDER_HOSTS: Record<string, string> = {
${hostEntries}
};

/** Per-provider fallback prices, used when a model isn't in the table. */
export const PROVIDER_FALLBACK: Record<string, PriceEntry> = {
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

/** Clock-time the table was generated from the catalog. */
export const PRICE_TABLE_UPDATED_AT: string = ${JSON.stringify(now)};

/**
 * Look up a price entry by model name (case-insensitive).
 *
 * Handles provider-prefixed model IDs (e.g. "openai/gpt-4o-mini-2024-07-18"
 * from OpenRouter) by stripping the prefix and retrying.
 *
 * Returns \`undefined\` only if the provider itself has no fallback.
 */
export function lookupPrice(
  model: string,
  provider: string,
  overrides?: Record<string, PriceEntry>
): PriceEntry | undefined {
  const key = model.toLowerCase().trim();

  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (k.toLowerCase().trim() === key) return v;
    }
  }

  if (PRICE_TABLE[key]) return PRICE_TABLE[key];

  // Strip provider prefix for models like "openai/gpt-4o-mini-2024-07-18".
  const slashIdx = key.indexOf("/");
  if (slashIdx > 0 && slashIdx < key.length - 1) {
    const stripped = key.slice(slashIdx + 1);
    if (overrides) {
      for (const [k, v] of Object.entries(overrides)) {
        if (k.toLowerCase().trim() === stripped) return v;
      }
    }
    if (PRICE_TABLE[stripped]) return PRICE_TABLE[stripped];
    const sortedKeys = Object.keys(PRICE_TABLE).sort((a, b) => b.length - a.length);
    for (const tableKey of sortedKeys) {
      if (stripped.length > tableKey.length && stripped.startsWith(tableKey)) {
        return PRICE_TABLE[tableKey];
      }
    }
  }

  const sortedKeys = Object.keys(PRICE_TABLE).sort((a, b) => b.length - a.length);
  for (const tableKey of sortedKeys) {
    if (key.length > tableKey.length && key.startsWith(tableKey)) {
      return PRICE_TABLE[tableKey];
    }
  }

  return PROVIDER_FALLBACK[provider] || PROVIDER_FALLBACK["generic"];
}
`;

  const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "ai", "cost-table.ts");
  writeFileSync(outPath, FILE, "utf8");
  console.log(`[update-prices] wrote ${outPath} (${keys.length} models, ${hostMap.size} provider hosts)`);
}

main().catch((err) => {
  console.error("[update-prices] failed:", err);
  process.exit(1);
});
