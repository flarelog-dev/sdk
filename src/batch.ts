import type { QueuedLog, FlareLogConfig, IngestResult } from "./types";
import { runWithHookSkipped } from "./console";

interface BatchConfig {
  batchSize: number;
  flushIntervalMs: number;
  debug: boolean;
  endpoint: string;
}

/**
 * Buffers logs and flushes them in batches.
 * Works in both Node.js and Cloudflare Workers environments.
 */
export class LogBatch {
  private buffer: QueuedLog[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private config: BatchConfig;
  private apiKey: string;
  private endpoint: string;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(
    config: Pick<FlareLogConfig, "batchSize" | "flushIntervalMs" | "debug" | "endpoint">,
    apiKey: string,
    _project: string
  ) {
    this.config = {
      batchSize: config.batchSize ?? 10,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      debug: config.debug ?? false,
      endpoint: (config.endpoint ?? "https://flarelog.dev").replace(/\/$/, ""),
    };
    this.apiKey = apiKey;
    this.endpoint = this.config.endpoint;
  }

  /** Add a log to the buffer and flush if needed */
  add(log: QueuedLog): void {
    this.buffer.push(log);

    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /** Schedule a flush after the interval */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  /** Flush all buffered logs immediately */
  flush(): Promise<void> {
    // Chain flushes to prevent parallel requests
    this.flushPromise = this.flushPromise.then(async () => {
      if (this.buffer.length === 0) return;

      const batch = this.buffer.splice(0, this.buffer.length);

      try {
        await this.sendBatch(batch);
      } catch (err) {
        // On failure, put logs back (up to max buffer size)
        const remaining = this.config.batchSize * 3;
        this.buffer = [...batch, ...this.buffer].slice(0, remaining);

        if (this.config.debug) {
          runWithHookSkipped(() => {
            console.error("[FlareLog] Failed to send logs:", err);
          });
        }
      }
    });

    return this.flushPromise;
  }

  /** Send a batch of logs to the ingestion endpoint */
  private async sendBatch(logs: QueuedLog[]): Promise<void> {
    const baseUrl = this.endpoint.endsWith("/api") ? this.endpoint : `${this.endpoint}/api`;
    const response = await fetch(`${baseUrl}/trpc/log.ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: this.apiKey,
        logs: logs.map((log) => ({
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
          source: log.source,
          metadata: log.metadata,
          traceId: log.traceId,
          spanId: log.spanId,
        })),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const result = (await response.json()) as { result?: { data?: IngestResult } };

    if (result.result?.data?.success === false) {
      throw new Error(
        `Ingestion failed: ${result.result.data.error ?? "Unknown error"}`
      );
    }

    if (this.config.debug) {
      runWithHookSkipped(() => {
        console.log(
          `[FlareLog] Sent ${logs.length} logs. Result:`,
          result.result?.data
        );
      });
    }
  }

  /** Clean up any pending timers */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
