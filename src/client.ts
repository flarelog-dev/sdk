import { type Span, type Attributes, type SpanOptions, type Tracer, type Logger, type LoggerProvider, SpanKind, SpanStatusCode } from "./otel/types";
import { activeContext, withContext, setSpan } from "./otel/context";
import type {
  FlareLogConfig,
  LogEntry,
  LogLevel,
  CaptureOptions,
  RequestContext,
  ConsoleCaptureOptions,
  UserContext,
  Breadcrumb,
  TransportConfig,
  FlareLogLike,
  WorkerFetchHandler,
} from "./types";
import { shouldLog } from "./levels";
import { serializeError, getErrorFingerprint } from "./errors";
import { installConsoleHooks, runWithHookSkipped } from "./console";
import { DedupTracker } from "./dedup";
import { buildResource } from "./otel/resource";
import { detectOtelEnv, detectFlarelogEnv, detectRuntime } from "./otel/env";
import { initProviders } from "./otel/providers";
import { ConsoleTransport } from "./otel/console-transport";
import { OTLPTransport } from "./otel/otlp-transport";
import { FlarelogTransport } from "./otel/flarelog-transport";
import type { Transport } from "./otel/transport";
import { createWorkerFetchHandler, wrapWorker } from "./workers";
import { extractContext, injectContext, getActiveSpanContext, ensurePropagatorInstalled } from "./otel/propagation";

/**
 * Map FlareLog levels to OTel severity numbers.
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
const SEVERITY_NUMBER: Record<LogLevel, number> = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
};

export interface FlareLogInternals {
  transports: Transport[];
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

/**
 * FlareLog — OTel-native logging client for Cloudflare Workers, Node.js, and browsers.
 *
 * v2 is a full rewrite on top of OpenTelemetry. Logs and traces are emitted
 * via the standard OTel API and exported via OTLP/HTTP JSON to any backend.
 *
 * Backwards compatibility: the v1 surface (`flarelog()`, `logger.info()`,
 * `workerFetch()`, `logger.child()`, etc.) is preserved. New features:
 * - `apiKey` is now optional (defaults to console output)
 * - Multiple transports fan out to console + OTLP + Flarelog simultaneously
 * - `workerFetch()` emits OTel SERVER spans with W3C traceparent propagation
 *
 * @example Local dev — no API key, no OTLP endpoint
 * ```ts
 * const logger = flarelog({});
 * logger.info("Hello");  // pretty-prints to console
 * ```
 *
 * @example Grafana Cloud free tier — no Flarelog API key needed
 * ```ts
 * // wrangler.toml: OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
 * //                OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic <base64>"
 * const logger = flarelog({});
 * logger.info("Hello");  // ships to Grafana Cloud
 * ```
 *
 * @example Flarelog hosted backend
 * ```ts
 * // wrangler.toml: FLARELOG_API_KEY = "fl_your_key"
 * const logger = flarelog({});
 * logger.info("Hello");  // ships to Flarelog dashboard
 * ```
 *
 * @example Fan-out — console in dev, Flarelog + Grafana in prod
 * ```ts
 * const logger = flarelog({
 *   apiKey: env.FLARELOG_API_KEY,        // → Flarelog
 *   otlpEndpoint: env.OTLP_ENDPOINT,      // → Grafana
 *   transports: [{ type: "console" }],    // → console
 * });
 * ```
 */
export class FlareLog {
  private logger: Logger;
  private tracer: Tracer;
  private config: {
    apiKey?: string;
    endpoint: string;
    allowInsecure: boolean;
    level: LogLevel;
    batchSize: number;
    flushIntervalMs: number;
    debug: boolean;
    defaultSource: string;
    includeTimestamps: boolean;
    autoCapture: NonNullable<FlareLogConfig["autoCapture"]>;
    environment: string;
    release: string;
    serverName: string;
    serviceName?: string;
    serviceNamespace?: string;
    resourceAttributes?: Record<string, string>;
    beforeSend: (log: LogEntry) => LogEntry | false;
    scrubFields: string[];
    sampleRate: number;
    maxBatchSize: number;
    onDrop: (droppedCount: number) => void;
    workerMode: boolean;
  };
  private dedup: DedupTracker;
  private consoleCleanup?: () => void;
  private globalCleanup?: () => void;
  private breadcrumbs: Breadcrumb[] = [];
  private user: UserContext | null = null;
  private tags: Map<string, string> = new Map();
  private flushFn: () => Promise<void>;
  private shutdownFn: () => Promise<void>;
  private transports: Transport[];

  /** @internal Exposed for advanced users who want to integrate with other OTel libraries */
  readonly tracerProvider: { getTracer(name: string, version?: string): Tracer };
  /** @internal Exposed for advanced users who want to integrate with other OTel libraries */
  readonly loggerProvider: LoggerProvider;

  constructor(config: FlareLogConfig = {}) {
    ensurePropagatorInstalled();

    const runtime = detectRuntime();
    const isWorker = config.workerMode ?? (runtime === "cloudflare-workers");

    // --- Resolve defaults ---
    const flarelogEnv = detectFlarelogEnv();
    const otelEnv = detectOtelEnv();

    const apiKey = config.apiKey ?? flarelogEnv.apiKey;
    const endpoint = (config.endpoint ?? flarelogEnv.endpoint ?? "https://flarelog.dev").replace(/\/$/, "");
    const environment = config.environment ?? flarelogEnv.environment ?? (isWorker ? "production" : "development");
    const release = config.release ?? flarelogEnv.release ?? "";
    const serverName = config.serverName ?? flarelogEnv.serverName ?? "";

    // --- Build transports ---
    this.transports = this.resolveTransports(config, otelEnv, apiKey, endpoint);

    // --- Build OTel resource ---
    const resource = buildResource({
      serviceName: config.serviceName ?? otelEnv.serviceName,
      serviceVersion: release || undefined,
      serviceNamespace: config.serviceNamespace,
      environment,
      serverName,
      attributes: { ...otelEnv.resourceAttributes, ...(config.resourceAttributes ?? {}) },
    });

    // --- Init providers (per-instance, not global) ---
    const { tracerProvider, loggerProvider, flush, shutdown } = initProviders({
      resource,
      transports: this.transports,
      debug: config.debug ?? false,
      workerMode: isWorker,
      maxQueueSize: Math.max(1, config.maxBatchSize ?? 100),
      scheduledDelayMillis: config.flushIntervalMs ?? (isWorker ? 0 : 5000),
    });
    this.flushFn = flush;
    this.shutdownFn = shutdown;
    this.tracerProvider = tracerProvider;
    this.loggerProvider = loggerProvider;

    // --- Get OTel Logger and Tracer (from this instance's providers, not globals) ---
    this.logger = loggerProvider.getLogger("flarelog", "2.0.0");
    this.tracer = tracerProvider.getTracer("flarelog", "2.0.0");

    // --- Resolved config (for level filtering, beforeSend, etc.) ---
    this.config = {
      apiKey,
      endpoint,
      allowInsecure: config.allowInsecure ?? false,
      level: config.level ?? "DEBUG",
      batchSize: config.batchSize ?? (isWorker ? 1 : 50),
      flushIntervalMs: config.flushIntervalMs ?? (isWorker ? 0 : 5000),
      debug: config.debug ?? false,
      defaultSource: config.defaultSource ?? "",
      includeTimestamps: config.includeTimestamps ?? true,
      autoCapture: config.autoCapture ?? {},
      environment,
      release,
      serverName,
      serviceName: config.serviceName,
      serviceNamespace: config.serviceNamespace,
      resourceAttributes: config.resourceAttributes,
      beforeSend: config.beforeSend ?? ((log: LogEntry) => log),
      scrubFields: config.scrubFields ?? [
        "password",
        "secret",
        "token",
        "apiKey",
        "api_key",
        "authorization",
        "auth",
        "cookie",
        "session",
        "credit_card",
        "creditCard",
        "ssn",
      ],
      sampleRate: config.sampleRate ?? 1.0,
      maxBatchSize: config.maxBatchSize ?? 100,
      onDrop: config.onDrop ?? (() => {}),
      workerMode: isWorker,
    };

    this.dedup = new DedupTracker({
      windowMs:
        typeof this.config.autoCapture.dedupWindowMs === "number"
          ? this.config.autoCapture.dedupWindowMs
          : 5000,
    });

    // --- Install auto-capture hooks ---
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

  // -------------------------------------------------------------------------
  // Transport resolution
  // -------------------------------------------------------------------------

  private resolveTransports(
    config: FlareLogConfig,
    otelEnv: ReturnType<typeof detectOtelEnv>,
    apiKey: string | undefined,
    flarelogEndpoint: string
  ): Transport[] {
    // Explicit transports array wins.
    if (config.transports && config.transports.length > 0) {
      return config.transports.map((t) => this.instantiateTransport(t, apiKey, flarelogEndpoint));
    }

    const transports: Transport[] = [];

    // 1. OTLP transport — if any OTLP env var or shorthand is set
    const otlpEndpoint = config.otlpEndpoint ?? otelEnv.otlpEndpoint;
    const otlpHeaders = config.otlpHeaders ?? otelEnv.otlpHeaders;
    if (otlpEndpoint || otelEnv.otlpLogsEndpoint || otelEnv.otlpTracesEndpoint) {
      transports.push(
        new OTLPTransport({
          endpoint: otlpEndpoint,
          logsEndpoint: otelEnv.otlpLogsEndpoint,
          tracesEndpoint: otelEnv.otlpTracesEndpoint,
          headers: otlpHeaders,
        })
      );
    }

    // 2. Flarelog transport — if API key is set
    if (apiKey) {
      transports.push(
        new FlarelogTransport({
          apiKey,
          endpoint: flarelogEndpoint,
          allowInsecure: config.allowInsecure,
        })
      );
    }

    // 3. Console fallback — if nothing else is configured
    if (transports.length === 0) {
      // Warn loudly (unless explicitly silenced). This catches the most common
      // deployment bug: user set FLARELOG_API_KEY in their platform's dashboard
      // (Cloudflare Workers, Lovable, Vercel) but the SDK can't see it at
      // module load because process.env is empty on those runtimes.
      // Without this warning, the SDK silently falls back to console-only and
      // the user's dashboard stays empty — they conclude the SDK is broken.
      if (config.warnOnConsoleFallback !== false) {
        // Use runWithHookSkipped so the warning isn't itself captured as a log
        // by the console hooks we may install below (otherwise we'd ship the
        // warning back to the console transport, creating a feedback loop).
        runWithHookSkipped(() => {
          // eslint-disable-next-line no-console
          console.warn(
            "[FlareLog] No backend configured — falling back to console-only logging. " +
              "Logs will NOT ship to a dashboard. To fix:\n" +
              "  • Cloudflare Workers / Lovable: secrets arrive as `env` bindings, not `process.env`. " +
              "Use `tanstackStartMiddleware()` / `honoMiddleware()` with no args, or pass `env` explicitly.\n" +
              "  • Node / Vercel: set FLARELOG_API_KEY in process.env before importing the SDK.\n" +
              "  • Any runtime: pass `apiKey` explicitly: `flarelog({ apiKey: 'fl_...' })`.\n" +
              "  • Or set OTEL_EXPORTER_OTLP_ENDPOINT to ship to any OTLP backend.\n" +
              "To silence this warning: `flarelog({ warnOnConsoleFallback: false })`.",
          );
        });
      }
      transports.push(new ConsoleTransport());
    }

    return transports;
  }

  private instantiateTransport(t: TransportConfig, apiKey: string | undefined, flarelogEndpoint: string): Transport {
    switch (t.type) {
      case "console":
        return new ConsoleTransport();
      case "otlp":
        return new OTLPTransport({
          endpoint: t.endpoint,
          logsEndpoint: t.logsEndpoint,
          tracesEndpoint: t.tracesEndpoint,
          headers: t.headers,
          enableLogs: t.enableLogs,
          enableTraces: t.enableTraces,
        });
      case "flarelog":
        return new FlarelogTransport({
          apiKey: t.apiKey ?? apiKey ?? "",
          endpoint: t.endpoint ?? flarelogEndpoint,
          enableTraces: t.enableTraces,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Logging methods (v1 API surface — preserved)
  // -------------------------------------------------------------------------

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
    if (!shouldLog(level, this.config.level)) return;
    if (Math.random() > this.config.sampleRate) return;

    // --- Apply beforeSend (v1 backwards compat) ---
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      source: opts?.source ?? this.config.defaultSource,
      metadata: this.enrichMetadata(metadata, opts),
      traceId: opts?.traceId ?? this.getActiveTraceId(),
      spanId: opts?.spanId ?? this.getActiveSpanId(),
    };
    const processed = this.config.beforeSend(entry);
    if (processed === false) return;

    // --- Emit via OTel Logs API ---
    // The LoggerProvider's processors fan out to all configured transports.
    // AnyValueMap (LogAttributes) is more permissive than Attributes — values
    // can be any JSON-serializable value.
    const attributes: Record<string, unknown> = { ...(processed.metadata ?? {}) };
    if (processed.source) attributes["source"] = processed.source;

    this.logger.emit({
      severityNumber: SEVERITY_NUMBER[processed.level],
      severityText: processed.level,
      body: processed.message,
      attributes: this.scrubAttributes(attributes) as never,
      // Pass the active Context so the LogRecord picks up the active span's
      // traceId + spanId (log-to-trace correlation).
      context: activeContext(),
    });
  }

  logRaw(entry: LogEntry): void {
    this.log(entry.level, entry.message, entry.metadata, {
      source: entry.source,
      traceId: entry.traceId,
      spanId: entry.spanId,
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
    const level = opts?.level ?? "ERROR";
    const errorData = serializeError(err);
    const message = opts?.message ?? (errorData.message as string) ?? "An error occurred";

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
  ): Promise<T | undefined> {
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
      if (opts?.rethrow !== false) throw err;
      return undefined;
    }
  }

  captureSync<T>(fn: () => T, opts?: CaptureOptions): T | undefined {
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
      if (opts?.rethrow !== false) throw err;
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Span-aware request wrapping (OTel SERVER span)
  // -------------------------------------------------------------------------

  /**
   * Wrap a request handler with an OTel SERVER span.
   *
   * - Extracts W3C traceparent from incoming headers (or starts a new trace)
   * - Creates a SPAN_KIND_SERVER span with http.method, url.path, etc.
   * - Attaches the span as active Context so all logs during the handler
   *   automatically carry traceId + spanId
   * - Records exceptions and sets span status
   * - Flushes telemetry via ctx.waitUntil()
   */
  async withRequest<T>(
    ctx: RequestContext,
    executionCtx: { waitUntil?: (promise: Promise<unknown>) => void },
    handler: () => Promise<T>
  ): Promise<T> {
    const req = ctx.request;
    const url = new URL(req.url);

    // Extract W3C trace context from incoming headers
    const parentContext = extractContext(req.headers);

    const spanName = `${req.method} ${url.pathname}`;
    const spanAttributes: Attributes = {
      "http.request.method": req.method,
      "url.full": req.url,
      "url.path": url.pathname,
      "url.scheme": url.protocol.replace(":", ""),
      "url.host": url.host,
      "http.request.header.user_agent": req.headers.get("user-agent") ?? "",
    };
    if (ctx.metadata) {
      for (const [k, v] of Object.entries(ctx.metadata)) {
        if (v !== undefined && v !== null) spanAttributes[k] = v as Attributes[string];
      }
    }
    const spanOptions: SpanOptions = {
      kind: SpanKind.SERVER,
      attributes: spanAttributes,
    };
    const span = this.tracer.startSpan(spanName, spanOptions, parentContext);

    if (ctx.traceId) {
      span.setAttribute("flarelog.trace_id_hint", ctx.traceId);
    }

    const activeCtx = setSpan(parentContext, span);

    return withContext(activeCtx, async () => {
      const startTime = Date.now();
      try {
        const result = await handler();
        const status = result instanceof Response ? result.status : 200;
        span.setAttribute("http.response.status_code", status);
        span.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK }); // ERROR or OK
        return result;
      } catch (err) {
        span.setAttribute("http.response.status_code", 500);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
        span.recordException(err as Error);
        this.logError(err, { message: "Request failed", metadata: { durationMs: Date.now() - startTime } });
        throw err;
      } finally {
        span.setAttribute("flarelog.duration_ms", Date.now() - startTime);
        span.end();
        if (typeof executionCtx.waitUntil === "function") {
          executionCtx.waitUntil(this.flush().catch((err) => {
            if (this.config.debug) {
              runWithHookSkipped(() => {
                // eslint-disable-next-line no-console
                console.error("[FlareLog] Flush failed in waitUntil:", err);
              });
            }
          }));
        } else {
          await this.flush();
        }
      }
    });
  }

  /**
   * Manually start a span. Returns the span and a wrapped function that ends
   * the span and flushes telemetry.
   *
   * @example
   * ```ts
   * return logger.startSpan("process-payment", async (span) => {
   *   span.setAttribute("payment.order_id", orderId);
   *   const result = await charge(orderId);
   *   span.setAttribute("payment.amount", result.amount);
   *   return result;
   * });
   * ```
   */
  async startSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    opts?: { attributes?: Attributes; kind?: SpanOptions["kind"] }
  ): Promise<T> {
    const span = this.tracer.startSpan(name, {
      kind: opts?.kind,
      attributes: opts?.attributes,
    });
    const ctx = setSpan(activeContext(), span);
    return withContext(ctx, async () => {
      try {
        return await fn(span);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
        throw err;
      } finally {
        span.end();
        await this.flush();
      }
    });
  }

  // -------------------------------------------------------------------------
  // W3C propagation helpers
  // -------------------------------------------------------------------------

  /**
   * Inject the current trace context into outgoing request headers.
   * Use this when calling other services via fetch() or service bindings
   * so the trace continues across the call boundary.
   */
  injectTraceContext(headers: Headers): Headers {
    return injectContext(headers);
  }

  /** Get the active trace ID (or undefined if no span is active). */
  getActiveTraceId(): string | undefined {
    return getActiveSpanContext()?.traceId;
  }

  /** Get the active span ID (or undefined if no span is active). */
  getActiveSpanId(): string | undefined {
    return getActiveSpanContext()?.spanId;
  }

  // -------------------------------------------------------------------------
  // Context (v1 API surface — preserved)
  // -------------------------------------------------------------------------

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    this.breadcrumbs.push({ ...breadcrumb, timestamp: new Date().toISOString() });
    if (this.breadcrumbs.length > 100) this.breadcrumbs = this.breadcrumbs.slice(-50);
  }

  setUser(user: UserContext | null): void {
    this.user = user;
  }

  setTag(key: string, value: string): void {
    this.tags.set(key, value);
  }

  child(defaults: Record<string, unknown> & { source?: string }): FlareLogChild {
    return new FlareLogChild(this, defaults);
  }

  // -------------------------------------------------------------------------
  // Worker helpers (v1 API surface — preserved)
  // -------------------------------------------------------------------------

  workerFetch<T = Response>(handler: WorkerFetchHandler<T>): WorkerFetchHandler<T> {
    return createWorkerFetchHandler(this, handler);
  }

  wrapWorker(WorkerCtor: typeof Worker): typeof Worker {
    return wrapWorker(this, WorkerCtor);
  }

  installConsoleHooks(opts?: ConsoleCaptureOptions): () => void {
    this.consoleCleanup?.();
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
        handlers.push(() => globalThis.removeEventListener("error", onError as EventListener));
      } catch { /* ignore */ }
    }

    if (captureRejections) {
      const onRejection = (event: PromiseRejectionEvent) => {
        this.captureAutomatic(event.reason, "global", "Unhandled promise rejection");
      };
      try {
        globalThis.addEventListener("unhandledrejection", onRejection as EventListener);
        handlers.push(() => globalThis.removeEventListener("unhandledrejection", onRejection as EventListener));
      } catch { /* ignore */ }
    }

    try {
      const process = (globalThis as unknown as Record<string, unknown>).process as Record<string, unknown> | undefined;
      if (process && typeof process.on === "function") {
        if (captureErrors) {
          const nodeOnError = (err: Error) => {
            this.captureAutomatic(err, "global", "Uncaught exception");
            (process.exit as (code?: number) => void)(1);
          };
          process.on("uncaughtException", nodeOnError);
          handlers.push(() => (process.off as (...args: unknown[]) => void)("uncaughtException", nodeOnError));
        }
        if (captureRejections) {
          const nodeOnRejection = (reason: unknown) => {
            this.captureAutomatic(reason, "global", "Unhandled promise rejection");
          };
          process.on("unhandledRejection", nodeOnRejection);
          handlers.push(() => (process.off as (...args: unknown[]) => void)("unhandledRejection", nodeOnRejection));
        }
      }
    } catch { /* ignore */ }

    const cleanup = () => handlers.forEach((h) => h());
    this.globalCleanup = cleanup;
    return cleanup;
  }

  private captureAutomatic(err: unknown, source: string, message: string): void {
    const fingerprint = getErrorFingerprint(err);
    if (this.dedup.isDuplicate(`${source}:${fingerprint}`)) return;
    this.logError(err, { message, source });
  }

  // -------------------------------------------------------------------------
  // Flush / shutdown
  // -------------------------------------------------------------------------

  flush(): Promise<void> {
    return this.flushFn();
  }

  destroy(): Promise<void> {
    this.consoleCleanup?.();
    this.globalCleanup?.();
    return this.shutdownFn();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private enrichMetadata(
    metadata: Record<string, unknown> | undefined,
    opts?: { source?: string; traceId?: string; spanId?: string }
  ): Record<string, unknown> {
    const enriched: Record<string, unknown> = { ...metadata };

    if (this.user) enriched.user = this.user;
    if (this.tags.size > 0) enriched.tags = Object.fromEntries(this.tags);
    if (this.config.environment) enriched.environment = this.config.environment;
    if (this.config.release) enriched.release = this.config.release;
    if (this.config.serverName) enriched.serverName = this.config.serverName;
    if (opts?.source ?? this.config.defaultSource) {
      enriched.source = opts?.source ?? this.config.defaultSource;
    }

    return enriched;
  }

  private scrubAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (this.config.scrubFields.some((f) => k.toLowerCase().includes(f.toLowerCase()))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = this.serializeForOtel(v);
      }
    }
    return out;
  }

  /**
   * OTel attributes only accept primitives and homogeneous arrays of primitives.
   * Complex values (objects, mixed arrays) get silently dropped. We JSON-stringify
   * them to preserve the data.
   */
  private serializeForOtel(v: unknown): unknown {
    if (v === null || v === undefined) return v;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) {
      // Check if it's a homogeneous primitive array
      const allPrim = v.every((x) => x === null || x === undefined || typeof x === "string" || typeof x === "number" || typeof x === "boolean");
      if (allPrim) {
        // OTel supports homogeneous primitive arrays — but only if all elements are the same type
        const firstType = v.find((x) => x !== null && x !== undefined)?.constructor;
        if (v.every((x) => x === null || x === undefined || x?.constructor === firstType)) {
          return v;
        }
      }
      return JSON.stringify(v);
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  /** @internal Exposed for tests and the factory function */
  _getTransports(): Transport[] {
    return this.transports;
  }
}

/**
 * FlareLogChild — a child logger that carries default metadata.
 * Logs via the parent's OTel Logger.
 */
export class FlareLogChild implements FlareLogLike {
  private defaults: Record<string, unknown>;
  private defaultSource?: string;

  constructor(
    private parent: FlareLog,
    defaults: Record<string, unknown> & { source?: string }
  ) {
    this.defaults = { ...defaults };
    this.defaultSource = defaults.source;
  }

  trace(message: string, metadata?: Record<string, unknown>): void { this.parent.trace(message, this.merge(metadata)); }
  debug(message: string, metadata?: Record<string, unknown>): void { this.parent.debug(message, this.merge(metadata)); }
  info(message: string, metadata?: Record<string, unknown>): void { this.parent.info(message, this.merge(metadata)); }
  warn(message: string, metadata?: Record<string, unknown>): void { this.parent.warn(message, this.merge(metadata)); }
  error(message: string, metadata?: Record<string, unknown>): void { this.parent.error(message, this.merge(metadata)); }
  fatal(message: string, metadata?: Record<string, unknown>): void { this.parent.fatal(message, this.merge(metadata)); }

  log(level: LogLevel, message: string, metadata?: Record<string, unknown>, opts?: { source?: string; traceId?: string; spanId?: string }): void {
    this.parent.log(level, message, this.merge(metadata), { source: opts?.source ?? this.defaultSource, traceId: opts?.traceId, spanId: opts?.spanId });
  }

  logError(err: unknown, opts?: { message?: string; level?: LogLevel; source?: string; metadata?: Record<string, unknown>; traceId?: string }): void {
    this.parent.logError(err, { ...opts, metadata: this.merge(opts?.metadata), source: opts?.source ?? this.defaultSource });
  }

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void { this.parent.addBreadcrumb(breadcrumb); }
  setUser(user: UserContext | null): void { this.parent.setUser(user); }
  setTag(key: string, value: string): void { this.parent.setTag(key, value); }
  flush(): Promise<void> { return this.parent.flush(); }
  child(defaults: Record<string, unknown> & { source?: string }): FlareLogChild {
    return new FlareLogChild(this.parent, { ...this.defaults, ...defaults });
  }

  private merge(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!metadata) return { ...this.defaults };
    return { ...this.defaults, ...metadata };
  }
}


