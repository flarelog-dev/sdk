import type {
  FlareLogConfig,
  LogEntry,
  LogLevel,
  QueuedLog,
  CaptureOptions,
  RequestContext,
  ConsoleCaptureOptions,
  WorkerFetchHandler,
} from "./types";
import { LogBatch } from "./batch";
import { shouldLog } from "./levels";
import { serializeError, getErrorFingerprint } from "./errors";
import { installConsoleHooks } from "./console";
import { createWorkerFetchHandler, wrapWorker } from "./workers";
import { DedupTracker } from "./dedup";

/**
 * FlareLog logging client.
 *
 * Works in Node.js, Cloudflare Workers, and any environment with `fetch` support.
 *
 * @example
 * ```ts
 * const logger = new FlareLog({
 *   apiKey: "lf_your_api_key",
 *   project: "my-worker",
 * });
 *
 * logger.info("Server started", { port: 8787 });
 *
 * // Capture errors automatically
 * const result = await logger.capture(() => riskyOperation());
 *
 * // Wrap a Cloudflare Worker request
 * export default {
 *   async fetch(request, env, ctx) {
 *     return logger.withRequest({ request, traceId: crypto.randomUUID() }, ctx, async () => {
 *       return handleRequest(request);
 *     });
 *   }
 * }
 * ```
 */
export class FlareLog {
  private config: Required<FlareLogConfig>;
  private batch: LogBatch;
  private dedup: DedupTracker;
  private consoleCleanup?: () => void;
  private globalCleanup?: () => void;

  constructor(config: FlareLogConfig) {
    if (!config.apiKey) {
      throw new Error("[FlareLog] apiKey is required");
    }
    if (!config.project) {
      throw new Error("[FlareLog] project is required");
    }

    this.config = {
      endpoint: config.endpoint ?? "https://flarelog.dev/api",
      level: config.level ?? "DEBUG",
      batchSize: config.batchSize ?? 10,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      debug: config.debug ?? false,
      defaultSource: config.defaultSource ?? "",
      includeTimestamps: config.includeTimestamps ?? true,
      apiKey: config.apiKey,
      project: config.project,
      autoCapture: config.autoCapture ?? {},
    };

    this.dedup = new DedupTracker({
      windowMs:
        typeof this.config.autoCapture.dedupWindowMs === "number"
          ? this.config.autoCapture.dedupWindowMs
          : 5000,
    });

    this.batch = new LogBatch(
      {
        batchSize: this.config.batchSize,
        flushIntervalMs: this.config.flushIntervalMs,
        debug: this.config.debug,
        endpoint: this.config.endpoint,
      },
      this.config.apiKey,
      this.config.project
    );

    if (this.config.autoCapture.console) {
      const opts =
        typeof this.config.autoCapture.console === "object"
          ? this.config.autoCapture.console
          : undefined;
      this.consoleCleanup = this.installConsoleHooks(opts);
    }

    if (this.config.autoCapture.globalErrors || this.config.autoCapture.rejections) {
      this.globalCleanup = this.installGlobalHandlers({
        errors: this.config.autoCapture.globalErrors,
        rejections: this.config.autoCapture.rejections,
      });
    }
  }

  trace(message: string, metadata?: Record<string, unknown>): void {
    this.log("TRACE", message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("DEBUG", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("INFO", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("WARN", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("ERROR", message, metadata);
  }

  fatal(message: string, metadata?: Record<string, unknown>): void {
    this.log("FATAL", message, metadata);
  }

  log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    opts?: { source?: string; traceId?: string; spanId?: string }
  ): void {
    if (!shouldLog(level, this.config.level)) {
      return;
    }

    const entry: QueuedLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      source: opts?.source ?? this.config.defaultSource,
      metadata,
      traceId: opts?.traceId,
      spanId: opts?.spanId,
    };

    this.batch.add(entry);
  }

  logRaw(entry: LogEntry): void {
    if (!shouldLog(entry.level, this.config.level)) {
      return;
    }

    const queued: QueuedLog = {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    };

    this.batch.add(queued);
  }

  logError(
    err: unknown,
    opts?: {
      message?: string;
      level?: LogLevel;
      source?: string;
      metadata?: Record<string, unknown>;
      traceId?: string;
    }
  ): void {
    const level = opts?.level ?? "ERROR";
    const errorData = serializeError(err);
    const message =
      opts?.message ?? (errorData.message as string) ?? "An error occurred";

    this.log(level, message, {
      ...opts?.metadata,
      error: errorData,
    }, {
      source: opts?.source ?? this.config.defaultSource,
      traceId: opts?.traceId,
    });
  }

  async capture<T>(
    fn: () => Promise<T> | T,
    opts?: CaptureOptions
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const label = opts?.label ? `${opts.label} failed` : undefined;
      this.logError(err, {
        message: label,
        level: opts?.level ?? "ERROR",
        source: opts?.source ?? this.config.defaultSource,
        metadata: opts?.metadata,
      });

      if (opts?.rethrow !== false) {
        throw err;
      }

      return undefined as T;
    }
  }

  captureSync<T>(fn: () => T, opts?: CaptureOptions): T {
    try {
      return fn();
    } catch (err) {
      const label = opts?.label ? `${opts.label} failed` : undefined;
      this.logError(err, {
        message: label,
        level: opts?.level ?? "ERROR",
        source: opts?.source ?? this.config.defaultSource,
        metadata: opts?.metadata,
      });

      if (opts?.rethrow !== false) {
        throw err;
      }

      return undefined as T;
    }
  }

  async withRequest<T>(
    ctx: RequestContext,
    executionCtx: { waitUntil: (promise: Promise<unknown>) => void },
    handler: () => Promise<T>
  ): Promise<T> {
    const req = ctx.request;
    const url = new URL(req.url);

    const child = this.child({
      source: "request",
      traceId: ctx.traceId,
      method: req.method,
      path: url.pathname,
      host: url.host,
      ...ctx.metadata,
    });

    const startTime = Date.now();
    child.debug("Request started");

    try {
      const result = await handler();

      const duration = Date.now() - startTime;
      child.info("Request completed", { durationMs: duration });

      executionCtx.waitUntil(this.flush());

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      child.logError(err, {
        message: "Request failed",
        metadata: { durationMs: duration },
      });

      executionCtx.waitUntil(this.flush());
      throw err;
    }
  }

  /**
   * Wrap a function as a Cloudflare Worker fetch handler.
   * Automatically captures request context, unhandled errors, and flushes logs.
   */
  workerFetch<T = Response>(
    handler: WorkerFetchHandler<T>
  ): WorkerFetchHandler<T> {
    return createWorkerFetchHandler(this, handler);
  }

  /**
   * Wrap a Web Worker constructor so worker errors are captured automatically.
   */
  wrapWorker(WorkerCtor: typeof Worker): typeof Worker {
    return wrapWorker(this, WorkerCtor);
  }

  /**
   * Install hooks on global console methods to capture errors and warnings.
   * Returns a cleanup function.
   */
  installConsoleHooks(opts?: ConsoleCaptureOptions): () => void {
    const cleanup = installConsoleHooks(this, {
      ...opts,
      dedupWindowMs:
        typeof this.config.autoCapture.dedupWindowMs === "number"
          ? this.config.autoCapture.dedupWindowMs
          : 5000,
    });

    this.consoleCleanup = cleanup;
    return cleanup;
  }

  /**
   * Install global error handlers to capture unhandled exceptions
   * and unhandled promise rejections.
   *
   * Works in browsers, Node.js, and Cloudflare Workers.
   * Returns a cleanup function to remove the handlers.
   */
  installGlobalHandlers(opts?: { errors?: boolean; rejections?: boolean }): () => void {
    const captureErrors = opts?.errors ?? true;
    const captureRejections = opts?.rejections ?? true;
    const handlers: Array<() => void> = [];

    if (captureErrors) {
      const onError = (event: ErrorEvent) => {
        this.captureAutomatic(event.error, "global", "Unhandled error");
      };

      try {
        globalThis.addEventListener("error", onError as EventListener);
        handlers.push(() => {
          globalThis.removeEventListener("error", onError as EventListener);
        });
      } catch {
        // Environment doesn't support addEventListener
      }
    }

    if (captureRejections) {
      const onRejection = (event: PromiseRejectionEvent) => {
        this.captureAutomatic(event.reason, "global", "Unhandled promise rejection");
      };

      try {
        globalThis.addEventListener(
          "unhandledrejection",
          onRejection as EventListener
        );
        handlers.push(() => {
          globalThis.removeEventListener(
            "unhandledrejection",
            onRejection as EventListener
          );
        });
      } catch {
        // Environment doesn't support addEventListener
      }
    }

    try {
      const process = (globalThis as unknown as Record<string, unknown>).process as Record<string, unknown> | undefined;
      if (process && typeof process.on === "function") {
        if (captureErrors) {
          const nodeOnError = (err: Error) => {
            this.captureAutomatic(err, "global", "Uncaught exception");
          };
          process.on("uncaughtException", nodeOnError);
          handlers.push(() => {
            (process.off as (...args: unknown[]) => void)("uncaughtException", nodeOnError);
          });
        }

        if (captureRejections) {
          const nodeOnRejection = (reason: unknown) => {
            this.captureAutomatic(reason, "global", "Unhandled promise rejection");
          };
          process.on("unhandledRejection", nodeOnRejection);
          handlers.push(() => {
            (process.off as (...args: unknown[]) => void)("unhandledRejection", nodeOnRejection);
          });
        }
      }
    } catch {
      // Not in Node.js
    }

    const cleanup = () => {
      for (const cleanup of handlers) {
        try {
          cleanup();
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    this.globalCleanup = cleanup;
    return cleanup;
  }

  /**
   * Flush all pending logs immediately.
   * Returns a promise that resolves when the flush is complete.
   */
  async flush(): Promise<void> {
    await this.batch.flush();
  }

  /**
   * Create a child logger with additional default metadata.
   * The child's metadata will be merged with the parent on every log.
   */
  child(
    defaults: Record<string, unknown> & { source?: string }
  ): FlareLogChild {
    return new FlareLogChild(this, defaults);
  }

  /**
   * Clean up resources. Call this when shutting down.
   */
  destroy(): void {
    this.batch.destroy();
    this.consoleCleanup?.();
    this.globalCleanup?.();
    this.consoleCleanup = undefined;
    this.globalCleanup = undefined;
  }

  private captureAutomatic(
    err: unknown,
    source: string,
    message: string,
    level?: LogLevel
  ): void {
    const key = `${source}:${message}:${getErrorFingerprint(err)}`;
    if (this.dedup.isDuplicate(key)) {
      return;
    }

    this.logError(err, {
      message,
      level: level ?? "ERROR",
      source,
    });
  }
}

export class FlareLogChild {
  private parent: FlareLog;
  private defaults: Record<string, unknown>;
  private defaultSource?: string;

  constructor(
    parent: FlareLog,
    defaults: Record<string, unknown> & { source?: string }
  ) {
    this.parent = parent;
    const { source, ...rest } = defaults;
    this.defaults = rest;
    this.defaultSource = source;
  }

  trace(message: string, metadata?: Record<string, unknown>): void {
    this.log("TRACE", message, metadata);
  }
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("DEBUG", message, metadata);
  }
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("INFO", message, metadata);
  }
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("WARN", message, metadata);
  }
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("ERROR", message, metadata);
  }
  fatal(message: string, metadata?: Record<string, unknown>): void {
    this.log("FATAL", message, metadata);
  }

  log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    opts?: { source?: string; traceId?: string; spanId?: string }
  ): void {
    this.parent.log(level, message, { ...this.defaults, ...metadata }, {
      source: this.defaultSource,
      traceId: opts?.traceId,
      spanId: opts?.spanId,
    });
  }

  logError(
    err: unknown,
    opts?: {
      message?: string;
      level?: LogLevel;
      source?: string;
      metadata?: Record<string, unknown>;
      traceId?: string;
    }
  ): void {
    this.parent.logError(err, {
      ...opts,
      source: opts?.source ?? this.defaultSource,
      metadata: { ...this.defaults, ...opts?.metadata },
    });
  }

  async capture<T>(
    fn: () => Promise<T> | T,
    opts?: CaptureOptions
  ): Promise<T> {
    return this.parent.capture(fn, {
      ...opts,
      source: opts?.source ?? this.defaultSource,
      metadata: { ...this.defaults, ...opts?.metadata },
    });
  }

  captureSync<T>(fn: () => T, opts?: CaptureOptions): T {
    return this.parent.captureSync(fn, {
      ...opts,
      source: opts?.source ?? this.defaultSource,
      metadata: { ...this.defaults, ...opts?.metadata },
    });
  }

  async flush(): Promise<void> {
    await this.parent.flush();
  }

  child(
    moreDefaults: Record<string, unknown> & { source?: string }
  ): FlareLogChild {
    return new FlareLogChild(this.parent, {
      ...this.defaults,
      ...moreDefaults,
    });
  }
}
