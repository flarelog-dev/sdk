import type { ReadableSpan, ReadableLogRecord } from "./types";
import { createExportLogsServiceRequest, createExportTraceServiceRequest } from "./otlp-serializer";
import { PermanentExportError, isPermanentExportError, type Transport } from "./transport";
import { runWithHookSkipped } from "../console";

/** HTTP statuses worth another attempt: timeouts, rate limits and server-side errors. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** After the server rejects our key or quota, stop sending for this long. */
const BLOCKED_PAUSE_MS = 60_000;

function describePermanentFailure(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return `Flarelog rejected the API key (HTTP ${status}). Check FLARELOG_API_KEY / apiKey. Telemetry is being dropped until the key is fixed.`;
    case 402:
      return "Flarelog monthly log limit reached (HTTP 402). Telemetry is being dropped until the quota resets or the plan is upgraded.";
    case 413:
      return "Flarelog rejected a batch as too large (HTTP 413). Lower maxBatchSize.";
    default:
      return `Flarelog rejected a batch (HTTP ${status}) and it will not be retried.`;
  }
}

/**
 * Stable key for a request body, so every attempt at the same batch — the
 * transport's own retries and a processor re-queue after a lost response alike —
 * carries the same `Idempotency-Key`. The server uses it to ingest the batch
 * once. cyrb53 is plenty here: keys only have to be unique per project over the
 * server's 48-hour window, and it needs no async crypto (unavailable in some
 * runtimes).
 */
export function idempotencyKeyFor(payload: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `fl-${hash.toString(36)}-${payload.length.toString(36)}`;
}

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
  /** Max retries on network failure. Default 1. */
  maxRetries?: number;
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
  private readonly maxRetries: number;
  /** Statuses already reported, so a stuck quota warns once instead of every flush. */
  private readonly warned = new Set<number>();
  /** While set in the future, batches are dropped without touching the network. */
  private blockedUntil = 0;
  private blockedStatus = 0;

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
    this.maxRetries = config.maxRetries ?? 1;
  }

  async exportLogs(logs: ReadableLogRecord[]): Promise<void> {
    if (logs.length === 0) return;
    const body = createExportLogsServiceRequest(logs);
    await this.sendWithRetry(this.logsUrl, body);
  }

  async exportSpans(spans: ReadableSpan[]): Promise<void> {
    if (!this.enableTraces || spans.length === 0) return;
    const body = createExportTraceServiceRequest(spans);
    await this.sendWithRetry(this.tracesUrl, body);
  }

  private async sendWithRetry(url: string, body: unknown): Promise<void> {
    const payload = JSON.stringify(body);
    const idempotencyKey = idempotencyKeyFor(payload);

    if (Date.now() < this.blockedUntil) {
      throw new PermanentExportError(
        `Flarelog export skipped: paused after HTTP ${this.blockedStatus}`,
        this.blockedStatus
      );
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.send(url, payload, idempotencyKey);
        this.warned.clear();
        return;
      } catch (err) {
        // Sending the same batch again cannot help; fail fast and let the
        // processor drop it.
        if (isPermanentExportError(err)) throw err;
        lastErr = err;
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }
    // Report the failure to the caller so the processor can re-queue the
    // batch instead of dropping it. Throwing here does NOT reach the
    // application: every flush() call site is .catch()-guarded, so the
    // "never crash the host app" contract still holds.
    runWithHookSkipped(() => {
      // eslint-disable-next-line no-console
      console.error(`[FlareLog] Flarelog export to ${url} failed after ${this.maxRetries + 1} attempts:`, lastErr);
    });
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async send(url: string, payload: string, idempotencyKey: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: payload,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        if (isRetryableStatus(response.status)) {
          throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
        }
        this.recordPermanentFailure(response.status);
        throw new PermanentExportError(`HTTP ${response.status} from ${url}: ${text}`, response.status);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private recordPermanentFailure(status: number): void {
    // A bad key or an exhausted quota will not fix itself within seconds; stop
    // hammering the endpoint for a minute instead of sending every batch just
    // to have it refused.
    if (status === 401 || status === 402 || status === 403) {
      this.blockedUntil = Date.now() + BLOCKED_PAUSE_MS;
      this.blockedStatus = status;
    }
    if (this.warned.has(status)) return;
    this.warned.add(status);
    runWithHookSkipped(() => {
      // eslint-disable-next-line no-console
      console.warn(`[FlareLog] ${describePermanentFailure(status)}`);
    });
  }

  async flush(): Promise<void> {
    // No buffering at the transport layer.
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up.
  }
}
