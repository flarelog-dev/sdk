/**
 * OpenTelemetry environment variable detection.
 *
 * Honors the standard OTEL_* environment variables so users can configure
 * FlareLog the same way they configure any other OTel SDK. See:
 * https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/
 */

/**
 * Read an env var from any of the runtimes FlareLog supports
 * (Node.js, Cloudflare Workers, browsers, Deno, Bun).
 */
function env(name: string): string | undefined {
  try {
    // Cloudflare Workers / Node / Bun expose `process.env`
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env && typeof proc.env === "object") {
      const v = proc.env[name];
      if (v !== undefined && v !== "") return v;
    }
  } catch {
    /* ignore */
  }

  try {
    // Cloudflare Workers `env` bindings aren't on globalThis, but users can
    // pass them to flarelog() explicitly. Nothing to do here.
  } catch {
    /* ignore */
  }

  return undefined;
}

/**
 * Parse `OTEL_RESOURCE_ATTRIBUTES` (key=value,key=value syntax).
 */
function parseResourceAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Parse `OTEL_EXPORTER_OTLP_HEADERS` (key=value,key=value syntax).
 */
function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

export interface OtelEnvConfig {
  /** OTLP/HTTP endpoint base URL, e.g. https://otlp-gateway-prod-eu-west-0.grafana.net */
  otlpEndpoint?: string;
  /** OTLP/HTTP endpoint specifically for logs (overrides otlpEndpoint) */
  otlpLogsEndpoint?: string;
  /** OTLP/HTTP endpoint specifically for traces (overrides otlpEndpoint) */
  otlpTracesEndpoint?: string;
  /** Headers to send with OTLP requests (e.g. Authorization for Grafana Cloud) */
  otlpHeaders: Record<string, string>;
  /** Protocol — only "http/json" is supported by this SDK. */
  otlpProtocol: "http/json";
  /** service.name resource attribute */
  serviceName?: string;
  /** Parsed OTEL_RESOURCE_ATTRIBUTES */
  resourceAttributes: Record<string, string>;
}

/**
 * Detect OTel configuration from environment variables.
 */
export function detectOtelEnv(): OtelEnvConfig {
  const protocol = (env("OTEL_EXPORTER_OTLP_PROTOCOL") ?? "http/json") as "http/json";
  return {
    otlpEndpoint: env("OTEL_EXPORTER_OTLP_ENDPOINT"),
    otlpLogsEndpoint: env("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"),
    otlpTracesEndpoint: env("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
    otlpHeaders: env("OTEL_EXPORTER_OTLP_HEADERS")
      ? parseHeaders(env("OTEL_EXPORTER_OTLP_HEADERS")!)
      : {},
    otlpProtocol: protocol,
    serviceName: env("OTEL_SERVICE_NAME"),
    resourceAttributes: env("OTEL_RESOURCE_ATTRIBUTES")
      ? parseResourceAttributes(env("OTEL_RESOURCE_ATTRIBUTES")!)
      : {},
  };
}

/**
 * Detect FlareLog-specific env vars.
 */
export interface FlarelogEnvConfig {
  /** Flarelog API key (enables Flarelog transport) */
  apiKey?: string;
  /** Flarelog endpoint (defaults to https://flarelog.dev) */
  endpoint: string;
  /** Environment name */
  environment?: string;
  /** Release version */
  release?: string;
  /** Server/hostname */
  serverName?: string;
}

export function detectFlarelogEnv(): FlarelogEnvConfig {
  return {
    apiKey: env("FLARELOG_API_KEY"),
    endpoint: env("FLARELOG_ENDPOINT") ?? "https://flarelog.dev",
    environment: env("FLARELOG_ENVIRONMENT") ?? env("NODE_ENV"),
    release: env("FLARELOG_RELEASE"),
    serverName: env("FLARELOG_SERVER_NAME"),
  };
}

/**
 * Runtime detection — what platform are we running on?
 */
export type Runtime = "cloudflare-workers" | "node" | "browser" | "deno" | "bun" | "unknown";

export function detectRuntime(): Runtime {
  try {
    if (typeof navigator !== "undefined" && navigator.userAgent?.includes("Cloudflare-Workers")) {
      return "cloudflare-workers";
    }
  } catch {
    /* ignore */
  }

  try {
    const proc = (globalThis as { process?: { version?: string } }).process;
    if (proc?.version) return "node";
  } catch {
    /* ignore */
  }

  // @ts-expect-error — Deno may not be defined in this runtime
  if (typeof Deno !== "undefined") return "deno";
  if (typeof window !== "undefined") return "browser";

  try {
    // Bun sets process.versions.bun
    const proc = (globalThis as { process?: { versions?: { bun?: string } } }).process;
    if (proc?.versions?.bun) return "bun";
  } catch {
    /* ignore */
  }

  return "unknown";
}

/**
 * Auto-detect `service.name` if not explicitly provided.
 * Uses package name, worker name, or falls back to "unknown_service".
 */
export function detectServiceName(): string {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env) {
      const pkg = proc.env.npm_package_name;
      if (pkg) return pkg;
    }
  } catch {
    /* ignore */
  }

  return "unknown_service";
}
