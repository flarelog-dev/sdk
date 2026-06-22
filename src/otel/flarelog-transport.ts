import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { JsonLogsSerializer, JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import type { Transport } from "./transport";

export interface FlarelogTransportConfig {
  /** Flarelog API key (required — this is the gated, paid backend) */
  apiKey: string;
  /** Flarelog endpoint. Defaults to https://flarelog.dev */
  endpoint?: string;
  /** Allow insecure HTTP endpoints (not recommended). Default false. */
  allowInsecure?: boolean;
  /** Enable traces (Flarelog free tier may be logs-only). Default true. */
  enableTraces?: boolean;
  /** Timeout per request in ms. Default 5000. */
  timeoutMs?: number;
}

/**
 * FlarelogTransport — ships telemetry to Flarelog's hosted backend.
 *
 * This is the GATED, monetized path. The SDK itself is free and open source,
 * but Flarelog's hosted dashboard, AI analysis, and long-term storage require
 * an API key. Users without a key still get the full SDK with console output
 * and/or OTLP export to any other backend.
 *
 * The Flarelog backend accepts standard OTLP/HTTP JSON at /api/v1/logs and
 * /api/v1/traces, plus the legacy /api/trpc/log.ingest endpoint for v1 clients.
 */
export class FlarelogTransport implements Transport {
  readonly name = "flarelog";

  private readonly apiKey: string;
  private readonly logsUrl: string;
  private readonly tracesUrl: string;
  private readonly enableTraces: boolean;
  private readonly timeoutMs: number;

  constructor(config: FlarelogTransportConfig) {
    if (!config.apiKey) {
      throw new Error("[FlareLog] FlarelogTransport requires `apiKey`");
    }
    const endpoint = (config.endpoint ?? "https://flarelog.dev").replace(/\/$/, "");
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(endpoint);
    if (endpoint.startsWith("http://") && !isLocalhost && !config.allowInsecure) {
      throw new Error(
        `[FlareLog] Insecure HTTP endpoint detected: ${endpoint}\n` +
          `For security, only HTTPS endpoints are allowed.\n` +
          `Use "allowInsecure: true" to explicitly allow HTTP (not recommended).`
      );
    }
    this.apiKey = config.apiKey;
    this.logsUrl = `${endpoint}/api/v1/logs`;
    this.tracesUrl = `${endpoint}/api/v1/traces`;
    this.enableTraces = config.enableTraces ?? true;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async exportLogs(logs: ReadableLogRecord[]): Promise<void> {
    if (logs.length === 0) return;
    const body = JSON.parse(new TextDecoder().decode(JsonLogsSerializer.serializeRequest(logs)));
    await this.send(this.logsUrl, body);
  }

  async exportSpans(spans: ReadableSpan[]): Promise<void> {
    if (!this.enableTraces || spans.length === 0) return;
    const body = JSON.parse(new TextDecoder().decode(JsonTraceSerializer.serializeRequest(spans)));
    await this.send(this.tracesUrl, body);
  }

  private async send(url: string, body: unknown): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        // eslint-disable-next-line no-console
        console.error(`[FlareLog] Flarelog export failed: HTTP ${response.status}: ${text}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[FlareLog] Flarelog export to ${url} failed:`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  async flush(): Promise<void> {
    // No buffering at the transport layer.
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up.
  }
}
