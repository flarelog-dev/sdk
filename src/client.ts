import type {
  FlareLogConfig,
  LogEntry,
  LogLevel,
  QueuedLog,
  CaptureOptions,
  RequestContext,
} from "./types";
import { LogBatch } from "./batch";
import { shouldLog } from "./levels";
import { serializeError } from "./errors";

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
    };

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
  }

  /** Log at TRACE level */
  trace(message: string, metadata?: Record<string, unknown>): void {
    this.log("TRACE", message, metadata);
  }

  /** Log at DEBUG level */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("DEBUG", message, metadata);
  }

  /** Log at INFO level */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("INFO", message, metadata);
  }

  /** Log at WARN level */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("WARN", message, metadata);
  }

  /** Log at ERROR level */
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("ERROR", message, metadata);
  }

  /** Log at FATAL level */
  fatal(message: string, metadata?: Record<string, unknown>): void {
    this.log("FATAL", message, metadata);
  }

  /**
   * Log with a specific level.
   * This is the core logging method that all level-specific methods delegate to.
   */
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

  /**
   * Log a raw entry directly. Useful for advanced use cases.
   */
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

  /**
   * Log an Error object with full serialization (including cause chain).
   * This is the recommended way to log exceptions.
   */
  logError(
    err: unknown,
    opts?: {
      message?: string;
      level?: "WARN" | "ERROR" | "FATAL";
      source?: string;
      metadata?: Record<string, unknown>;
      traceId?: string;
    }
  ): void {
    const level = opts?.level ?? "ERROR";
    const errorData = serializeError(err);
    const message =
      opts?.message ??
      (errorData.message as string) ??
      "An error occurred";

    this.log(level, message, {
      ...opts?.metadata,
      error: errorData,
    }, {
      source: opts?.source ?? this.config.defaultSource,
      traceId: opts?.traceId,
    });
  }

  /**
   * Wrap an async function. If it throws, the error is auto-logged with
   * full context and then re-thrown (unless rethrow: false).
   *
   * @example
   * ```ts
   * const user = await logger.capture(
   *   () => fetchUser(id),
   *   { source: "user-service", label: "fetchUser", metadata: { userId: id } }
   * );
   * ```
   */
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

      // Return undefined when not rethrowing — caller must handle
      return undefined as T;
    }
  }

  /**
   * Wrap a synchronous function. If it throws, the error is auto-logged.
   *
   * @example
   * ```ts
   * const config = logger.captureSync(
   *   () => JSON.parse(raw),
   *   { source: "config-parser", label: "parseConfig" }
   * );
   * ```
   */
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

  /**
   * Wrap a Cloudflare Worker request handler.
   * Auto-captures request context and any unhandled errors.
   *
   * @example
   * ```ts
   * export default {
   *   async fetch(request, env, ctx) {
   *     return logger.withRequest(
   *       { request, traceId: crypto.randomUUID() },
   *       ctx,
   *       async () => {
   *         return new Response("Hello!");
   *       }
   *     );
   *   }
   * }
   * ```
   */
  async withRequest<T>(
    ctx: RequestContext,
    executionCtx: { waitUntil: (promise: Promise<unknown>) => void },
    handler: () => Promise<T>
  ): Promise<T> {
    const req = ctx.request;
    const url = new URL(req.url);

    // Create a request-scoped child logger
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

      // Ensure logs are flushed
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
   * Install global error handlers to capture unhandled exceptions
   * and unhandled promise rejections.
   *
   * Works in browsers, Node.js, and Cloudflare Workers.
   * Returns a cleanup function to remove the handlers.
   *
   * @example
   * ```ts
   * // In your worker entry point
   * logger.installGlobalHandlers();
   * ```
   */
  installGlobalHandlers(): () => void {
    const handlers: Array<() => void> = [];

    // Error events (runtime exceptions)
    const onError = (event: ErrorEvent) => {
      this.logError(event.error, {
        message: "Unhandled error",
        source: "global",
      });
    };

    // Unhandled promise rejections
    const onRejection = (event: PromiseRejectionEvent) => {
      this.logError(event.reason, {
        message: "Unhandled promise rejection",
        source: "global",
      });
    };

    // Try-catch for environments that support these events
    try {
      globalThis.addEventListener("error", onError as EventListener);
      globalThis.addEventListener(
        "unhandledrejection",
        onRejection as EventListener
      );
      handlers.push(() => {
        globalThis.removeEventListener("error", onError as EventListener);
        globalThis.removeEventListener(
          "unhandledrejection",
          onRejection as EventListener
        );
      });
    } catch {
      // Environment doesn't support addEventListener
    }

    // Node.js specific: uncaughtException and unhandledRejection
    try {
      const process = (globalThis as unknown as Record<string, unknown>).process as Record<string, unknown> | undefined;
      if (process && typeof process.on === "function") {
        const nodeOnError = (err: Error) => {
          this.logError(err, {
            message: "Uncaught exception",
            source: "global",
          });
        };
        const nodeOnRejection = (reason: unknown) => {
          this.logError(reason, {
            message: "Unhandled promise rejection",
            source: "global",
          });
        };
        process.on("uncaughtException", nodeOnError);
        process.on("unhandledRejection", nodeOnRejection);
        handlers.push(() => {
          (process.off as (...args: unknown[]) => void)("uncaughtException", nodeOnError);
          (process.off as (...args: unknown[]) => void)("unhandledRejection", nodeOnRejection);
        });
      }
    } catch {
      // Not in Node.js
    }

    // Return cleanup function
    return () => {
      for (const cleanup of handlers) {
        try {
          cleanup();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
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
  }
}

/**
 * A child logger that carries default metadata.
 * Created via `logger.child({ ... })`.
 */
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
    opts?: { traceId?: string; spanId?: string }
  ): void {
    this.parent.log(level, message, { ...this.defaults, ...metadata }, {
      source: this.defaultSource,
      traceId: opts?.traceId,
      spanId: opts?.spanId,
    });
  }

  /**
   * Log an Error with full serialization.
   */
  logError(
    err: unknown,
    opts?: {
      message?: string;
      level?: "WARN" | "ERROR" | "FATAL";
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

  /**
   * Wrap an async function with this child's default metadata.
   */
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

  /**
   * Wrap a sync function with this child's default metadata.
   */
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
