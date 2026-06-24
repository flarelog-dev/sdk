import type { ReadableSpan, ReadableLogRecord } from "./types";
import { createExportLogsServiceRequest, createExportTraceServiceRequest } from "./otlp-serializer";
import type { Transport } from "./transport";
import { runWithHookSkipped } from "../console";

export interface OTLPTransportConfig {
  /** Base URL, e.g. https://otlp-gateway-prod-eu-west-0.grafana.net */
  endpoint?: string;
  /** Override endpoint for logs only */
  logsEndpoint?: string;
  /** Override endpoint for traces only */
  tracesEndpoint?: string;
  /** Headers (e.g. Authorization for Grafana Cloud / Honeycomb) */
  headers?: Record<string, string>;
  /** Send logs to this transport. Default true. */
  enableLogs?: boolean;
  /** Send traces to this transport. Default true. */
  enableTraces?: boolean;
  /** Max retries on network failure. Default 1. */
  maxRetries?: number;
  /** Timeout per request in ms. Default 5000 (Workers), 30000 (Node). */
  timeoutMs?: number;
}

/** Resolve the OTLP/HTTP path for a signal. */
function resolveSignalPath(base: string, signal: "logs" | "traces"): string {
  // Strip trailing slash
  const url = base.replace(/\/$/, "");
  // If the user passed a full path that already ends in /v1/<signal>, use as-is
  if (url.endsWith(`/v1/${signal}`)) return url;
  // If it ends in /v1, append /<signal>
  if (url.endsWith("/v1")) return `${url}/${signal}`;
  // Otherwise, append /v1/<signal> (standard OTLP/HTTP JSON path)
  return `${url}/v1/${signal}`;
}

/**
 * OTLPTransport — ships telemetry to any OTLP/HTTP JSON endpoint.
 *
 * Works with Grafana Cloud, Honeycomb, Tempo, Jaeger, Datadog (OTLP ingest),
 * self-hosted collectors, or any backend that accepts OTLP/HTTP JSON.
 *
 * @example
 * ```ts
 * new OTLPTransport({
 *   endpoint: "https://otlp-gateway-prod-eu-west-0.grafana.net",
 *   headers: {
 *     Authorization: "Basic " + btoa(`${GRAFANA_INSTANCE_ID}:${GRAFANA_API_KEY}`),
 *   },
 * })
 * ```
 */
export class OTLPTransport implements Transport {
  readonly name = "otlp";

  private readonly logsUrl: string;
  private readonly tracesUrl: string;
  private readonly headers: Record<string, string>;
  private readonly enableLogs: boolean;
  private readonly enableTraces: boolean;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(config: OTLPTransportConfig = {}) {
    const base = config.endpoint;
    if (!base && !config.logsEndpoint && !config.tracesEndpoint) {
      throw new Error("[FlareLog] OTLPTransport requires `endpoint`, `logsEndpoint`, or `tracesEndpoint`");
    }
    this.logsUrl = config.logsEndpoint ?? (base ? resolveSignalPath(base, "logs") : "");
    this.tracesUrl = config.tracesEndpoint ?? (base ? resolveSignalPath(base, "traces") : "");
    this.headers = { "Content-Type": "application/json", ...(config.headers ?? {}) };
    this.enableLogs = config.enableLogs ?? !!this.logsUrl;
    this.enableTraces = config.enableTraces ?? !!this.tracesUrl;
    this.maxRetries = config.maxRetries ?? 1;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async exportLogs(logs: ReadableLogRecord[]): Promise<void> {
    if (!this.enableLogs || logs.length === 0) return;
    const body = createExportLogsServiceRequest(logs);
    await this.sendWithRetry(this.logsUrl, body);
  }

  async exportSpans(spans: ReadableSpan[]): Promise<void> {
    if (!this.enableTraces || spans.length === 0) return;
    const body = createExportTraceServiceRequest(spans);
    await this.sendWithRetry(this.tracesUrl, body);
  }

  private async sendWithRetry(url: string, body: unknown): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.send(url, body);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) {
          // Tiny backoff — keep Workers-friendly (no setTimeout needed if we await fetch)
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }
    // Don't throw — transport errors shouldn't crash the app.
    // Log to console so the developer knows their backend is unreachable.
    runWithHookSkipped(() => {
      // eslint-disable-next-line no-console
      console.error(`[FlareLog] OTLP export to ${url} failed after ${this.maxRetries + 1} attempts:`, lastErr);
    });
  }

  private async send(url: string, body: unknown): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async flush(): Promise<void> {
    // No buffering at the transport layer — we send immediately on each export.
    // Batching is handled by BatchLogRecordProcessor / BatchSpanProcessor.
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up.
  }
}
