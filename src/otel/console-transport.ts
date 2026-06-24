import type { ReadableSpan, ReadableLogRecord } from "./types";
import type { Transport } from "./transport";
import { runWithHookSkipped } from "../console";

const LEVEL_COLORS: Record<string, string> = {
  TRACE: "\x1b[90m",   // gray
  DEBUG: "\x1b[36m",   // cyan
  INFO: "\x1b[32m",    // green
  WARN: "\x1b[33m",    // yellow
  ERROR: "\x1b[31m",   // red
  FATAL: "\x1b[35m",   // magenta
};
const RESET = "\x1b[0m";

function hasColorSupport(): boolean {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined>, stdout?: { isTTY?: boolean } } }).process;
    if (proc?.env?.NO_COLOR) return false;
    if (proc?.stdout?.isTTY) return true;
  } catch {
    /* ignore */
  }
  // In Workers / browser console, ANSI codes don't render — but the console
  // itself does color formatting, so we just emit plain text there.
  return false;
}

function formatLog(log: ReadableLogRecord): string {
  const color = hasColorSupport();
  const ts = new Date(Number(log.hrTime[0]) * 1000 + log.hrTime[1] / 1_000_000).toISOString();
  const level = log.severityText ?? "INFO";
  const coloredLevel = color ? `${LEVEL_COLORS[level] ?? ""}${level.padEnd(5)}${RESET}` : level.padEnd(5);
  const body = typeof log.body === "string" ? log.body : JSON.stringify(log.body);
  const attrs = log.attributes ?? {};

  const ctxParts: string[] = [];
  if (log.spanContext?.traceId) ctxParts.push(`trace=${log.spanContext.traceId.slice(0, 8)}`);
  if (log.spanContext?.spanId) ctxParts.push(`span=${log.spanContext.spanId}`);
  if (attrs["source"]) ctxParts.push(`src=${attrs["source"]}`);
  const ctxStr = ctxParts.length ? ` ${color ? "\x1b[2m" : ""}[${ctxParts.join(" ")}]${color ? RESET : ""}` : "";

  // Drop the keys we've already surfaced (source, traceId, spanId)
  const remaining: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k !== "source" && k !== "traceId" && k !== "spanId") {
      remaining[k] = v;
    }
  }
  const meta = Object.keys(remaining).length ? ` ${JSON.stringify(remaining)}` : "";

  return `${ts} ${coloredLevel} ${body}${ctxStr}${meta}`;
}

function formatSpan(span: ReadableSpan): string {
  const color = hasColorSupport();
  const durationMs = (span.endTime[0] - span.startTime[0]) * 1000 + (span.endTime[1] - span.startTime[1]) / 1_000_000;
  const status = span.status.code === 2 ? "ERROR" : span.status.code === 1 ? "OK" : "UNSET";
  const attrs = span.attributes ?? {};
  const method = attrs["http.request.method"] ?? attrs["http.method"];
  const path = attrs["url.path"] ?? attrs["http.target"];
  const statusCode = attrs["http.response.status_code"] ?? attrs["http.status_code"];
  const httpInfo = method || path ? ` ${color ? "\x1b[36m" : ""}${method ?? ""} ${path ?? ""}${statusCode ? ` → ${statusCode}` : ""}${color ? RESET : ""}` : "";
  const traceId = span.spanContext.traceId;
  const spanId = span.spanContext.spanId;
  const ctxStr = color ? ` \x1b[2m[trace=${traceId.slice(0, 8)} span=${spanId} ${durationMs.toFixed(1)}ms ${status}]\x1b[0m` : ` [trace=${traceId.slice(0, 8)} span=${spanId} ${durationMs.toFixed(1)}ms ${status}]`;
  return `${span.name}${httpInfo}${ctxStr}`;
}

/**
 * ConsoleTransport — pretty-prints telemetry to stdout/stderr.
 *
 * This is the default when no API key and no OTLP endpoint are configured.
 * Lets developers see exactly what would be shipped without any backend setup.
 */
export class ConsoleTransport implements Transport {
  readonly name = "console";

  async exportLogs(logs: ReadableLogRecord[]): Promise<void> {
    for (const log of logs) {
      const line = formatLog(log);
      const level = log.severityText ?? "INFO";
      // route fatal/error/warn to console.error, others to console.log
      runWithHookSkipped(() => {
        if (level === "FATAL" || level === "ERROR" || level === "WARN") {
          // eslint-disable-next-line no-console
          console.error(line);
        } else {
          // eslint-disable-next-line no-console
          console.log(line);
        }
      });
    }
  }

  async exportSpans(spans: ReadableSpan[]): Promise<void> {
    for (const span of spans) {
      runWithHookSkipped(() => {
        // eslint-disable-next-line no-console
        console.log(formatSpan(span));
      });
    }
  }

  async flush(): Promise<void> {
    // No buffering — we print immediately.
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up.
  }
}
