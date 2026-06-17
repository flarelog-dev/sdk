import type {
  FlareLogConfig,
  LogEntry,
  LogLevel,
  QueuedLog,
  CaptureOptions,
  RequestContext,
  ConsoleCaptureOptions,
  WorkerFetchHandler,
  UserContext,
  Breadcrumb,
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
 *   environment: "production",
 *   release: "1.2.3",
 * });
 *
 * logger.info("Server started", { port: 8787 });
 *
 * // Set user context
 * logger.setUser({ id: "user_123", email: "user@example.com" });
 *
 * // Add breadcrumbs
 * logger.addBreadcrumb({
 *   category: "navigation",
 *   message: "User navigated to /checkout",
 *   data: { from: "/cart" }
 * });
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
  private breadcrumbs: Breadcrumb[] = [];
  private user: UserContext | null = null;
  private tags: Map<string, string> = new Map();
  private httpCleanup?: () => void;
  private navigationCleanup?: () => void;
  private clickCleanup?: () => void;

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
      batchSize: config.batchSize ?? (config.workerMode ? 1 : 10),
      flushIntervalMs: config.flushIntervalMs ?? (config.workerMode ? 0 : 5000),
      debug: config.debug ?? false,
      defaultSource: config.defaultSource ?? "",
      includeTimestamps: config.includeTimestamps ?? true,
      apiKey: config.apiKey,
      project: config.project,
      autoCapture: config.autoCapture ?? {},
      environment: config.environment ?? "development",
      release: config.release ?? "",
      serverName: config.serverName ?? "",
      beforeSend: config.beforeSend ?? ((log: LogEntry) => log),
      sampleRate: config.sampleRate ?? 1.0,
      maxBatchSize: config.maxBatchSize ?? 100,
      workerMode: config.workerMode ?? false,
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
        maxBatchSize: this.config.maxBatchSize,
        workerMode: this.config.workerMode,
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

    if (this.config.autoCapture.http) {
      this.httpCleanup = this.installHttpInstrumentation();
    }

    if (this.config.autoCapture.navigation) {
      this.navigationCleanup = this.installNavigationInstrumentation();
    }

    if (this.config.autoCapture.clicks) {
      this.clickCleanup = this.installClickInstrumentation();
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

    if (Math.random() > this.config.sampleRate) {
      return;
    }

    const entry: QueuedLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      source: opts?.source ?? this.config.defaultSource,
      metadata: this.enrichMetadata(metadata),
      traceId: opts?.traceId,
      spanId: opts?.spanId,
    };

    const processed = this.config.beforeSend(entry);
    if (processed === false) {
      return;
    }

    // Ensure timestamp is set after beforeSend
    const finalEntry: QueuedLog = {
      ...processed,
      timestamp: processed.timestamp ?? new Date().toISOString(),
    };

    this.batch.add(finalEntry);
  }

  logRaw(entry: LogEntry): void {
    if (!shouldLog(entry.level, this.config.level)) {
      return;
    }

    const queued: QueuedLog = {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      metadata: this.enrichMetadata(entry.metadata),
    };

    const processed = this.config.beforeSend(queued);
    if (processed === false) {
      return;
    }

    // Ensure timestamp is set after beforeSend
    const finalEntry: QueuedLog = {
      ...processed,
      timestamp: processed.timestamp ?? new Date().toISOString(),
    };

    this.batch.add(finalEntry);
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
      breadcrumbs: this.breadcrumbs.slice(-50),
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
   * Add a breadcrumb to track events leading to errors
   */
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    });

    if (this.breadcrumbs.length > 100) {
      this.breadcrumbs = this.breadcrumbs.slice(-50);
    }
  }

  /**
   * Set user context for identifying affected users
   */
  setUser(user: UserContext | null): void {
    this.user = user;
  }

  /**
   * Set a tag for filtering and searching logs
   */
  setTag(key: string, value: string): void {
    this.tags.set(key, value);
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
    this.httpCleanup?.();
    this.navigationCleanup?.();
    this.clickCleanup?.();
    this.consoleCleanup = undefined;
    this.globalCleanup = undefined;
    this.httpCleanup = undefined;
    this.navigationCleanup = undefined;
    this.clickCleanup = undefined;
  }

  private enrichMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
    const enriched: Record<string, unknown> = {
      ...metadata,
    };

    if (this.user) {
      enriched.user = this.user;
    }

    if (this.tags.size > 0) {
      enriched.tags = Object.fromEntries(this.tags);
    }

    if (this.config.environment) {
      enriched.environment = this.config.environment;
    }

    if (this.config.release) {
      enriched.release = this.config.release;
    }

    if (this.config.serverName) {
      enriched.serverName = this.config.serverName;
    }

    try {
      if (typeof navigator !== "undefined") {
        enriched.userAgent = navigator.userAgent;
        enriched.language = navigator.language;
        enriched.onLine = navigator.onLine;
      }

      if (typeof window !== "undefined") {
        enriched.url = window.location?.href;
        enriched.referrer = document?.referrer;
        enriched.viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        };
        enriched.screen = {
          width: window.screen?.width,
          height: window.screen?.height,
        };
      }

      if (typeof (globalThis as any).process !== "undefined" && (globalThis as any).process.version) {
        enriched.nodeVersion = (globalThis as any).process.version;
        enriched.platform = (globalThis as any).process.platform;
      }
    } catch {
      // Ignore environment detection errors
    }

    return enriched;
  }

  private installHttpInstrumentation(): () => void {
    const handlers: Array<() => void> = [];

    try {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
        const [url, init] = args;
        const start = Date.now();
        const method = init?.method ?? "GET";
        const urlString = typeof url === "string" ? url : url.toString();

        this.addBreadcrumb({
          category: "http",
          message: `${method} ${urlString}`,
          data: { url: urlString, method },
        });

        try {
          const response = await originalFetch.apply(globalThis, args);
          const duration = Date.now() - start;

          this.addBreadcrumb({
            category: "http",
            message: `${method} ${urlString} - ${response.status}`,
            data: { url: urlString, method, status: response.status, durationMs: duration },
          });

          return response;
        } catch (err) {
          const duration = Date.now() - start;

          this.addBreadcrumb({
            category: "http",
            message: `${method} ${urlString} - failed`,
            level: "ERROR",
            data: { url: urlString, method, error: (err as Error).message, durationMs: duration },
          });

          throw err;
        }
      };

      handlers.push(() => {
        globalThis.fetch = originalFetch;
      });
    } catch {
      // fetch not available
    }

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

  private installNavigationInstrumentation(): () => void {
    const handlers: Array<() => void> = [];

    try {
      const onPopState = () => {
        this.addBreadcrumb({
          category: "navigation",
          message: `Navigation to ${window.location.href}`,
          data: { url: window.location.href, path: window.location.pathname },
        });
      };

      window.addEventListener("popstate", onPopState);
      handlers.push(() => window.removeEventListener("popstate", onPopState));

      const originalPushState = history.pushState;
      const self = this;
      history.pushState = function (...args: Parameters<typeof history.pushState>) {
        originalPushState.apply(history, args);
        self.addBreadcrumb({
          category: "navigation",
          message: `Navigation to ${window.location.href}`,
          data: { url: window.location.href, path: window.location.pathname },
        });
      }.bind(this);

      handlers.push(() => {
        history.pushState = originalPushState;
      });
    } catch {
      // Not in browser
    }

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

  private installClickInstrumentation(): () => void {
    const handlers: Array<() => void> = [];

    try {
      const onClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target) return;

        const tagName = target.tagName?.toLowerCase();
        const id = target.id ? `#${target.id}` : "";
        const className = target.className ? `.${target.className.split(" ").join(".")}` : "";
        const selector = `${tagName}${id}${className}`;
        const text = target.textContent?.substring(0, 100) ?? "";

        this.addBreadcrumb({
          category: "ui.click",
          message: `Click on ${selector}`,
          data: { selector, text, tagName },
        });
      };

      document.addEventListener("click", onClick, true);
      handlers.push(() => document.removeEventListener("click", onClick, true));
    } catch {
      // Not in browser
    }

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

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    this.parent.addBreadcrumb(breadcrumb);
  }

  setUser(user: UserContext | null): void {
    this.parent.setUser(user);
  }

  setTag(key: string, value: string): void {
    this.parent.setTag(key, value);
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
