import { vi } from "vitest";

/**
 * Parse OTLP/HTTP JSON logs from a fetch mock's last call body.
 *
 * The FlarelogTransport and OTLPTransport both ship logs as OTLP JSON:
 * {
 *   resourceLogs: [{
 *     scopeLogs: [{ logRecords: [...] }]
 *   }]
 * }
 */
export function extractOtlpLogs(body: unknown): Array<{
  timeUnixNano?: string;
  severityNumber?: number;
  severityText?: string;
  body?: { stringValue?: string };
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }>;
  traceId?: string;
  spanId?: string;
}> {
  const data = typeof body === "string" ? JSON.parse(body) : body;
  const out: ReturnType<typeof extractOtlpLogs> = [];
  for (const rl of data.resourceLogs ?? []) {
    for (const sl of rl.scopeLogs ?? []) {
      for (const rec of sl.logRecords ?? []) {
        out.push(rec);
      }
    }
  }
  return out;
}

/**
 * Parse OTLP/HTTP JSON spans from a fetch mock's last call body.
 */
export function extractOtlpSpans(body: unknown): Array<{
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number } }>;
  status?: { code?: number; message?: string };
}> {
  const data = typeof body === "string" ? JSON.parse(body) : body;
  const out: ReturnType<typeof extractOtlpSpans> = [];
  for (const rs of data.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const sp of ss.spans ?? []) {
        out.push(sp);
      }
    }
  }
  return out;
}

/** Convert an OTLP AnyValue to a JS value (handles nested kvlistValue, arrayValue). */
export function anyValueToJs(v: {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values?: unknown[] };
  kvlistValue?: { values?: Array<{ key: string; value: unknown }> };
}): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue?.values) return v.arrayValue.values.map((x) => anyValueToJs(x as never));
  if (v.kvlistValue?.values) {
    const obj: Record<string, unknown> = {};
    for (const kv of v.kvlistValue.values) {
      obj[kv.key] = anyValueToJs(kv.value as never);
    }
    return obj;
  }
  return undefined;
}

/** Convert an OTLP attribute array to a plain object. */
export function attrsToObject(
  attrs?: Array<{ key: string; value: Record<string, unknown> }>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attrs ?? []) {
    out[a.key] = anyValueToJs(a.value as never);
  }
  return out;
}

/** Get the last fetch call's body — works for both logs and traces endpoints. */
export function getLastCallBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const calls = fetchMock.mock.calls;
  if (calls.length === 0) return undefined;
  // fetch is called as fetch(url, options) — body is in options
  const lastCall = calls[calls.length - 1];
  const opts = lastCall[1] as { body?: string } | undefined;
  if (!opts?.body) return undefined;
  try {
    return JSON.parse(opts.body);
  } catch {
    return opts.body;
  }
}

/** Get all fetch call bodies (one per call). */
export function getAllCallBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls.map((call) => {
    const opts = call[1] as { body?: string } | undefined;
    if (!opts?.body) return undefined;
    try {
      return JSON.parse(opts.body);
    } catch {
      return opts.body;
    }
  });
}

/** Find the call(s) that hit a logs endpoint (URL ends in /v1/logs). */
export function getLogCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes("/v1/logs"))
    .map((c) => {
      const opts = c[1] as { body?: string };
      try {
        return opts?.body ? JSON.parse(opts.body) : undefined;
      } catch {
        return opts?.body;
      }
    });
}

/** Find the call(s) that hit a traces endpoint (URL ends in /v1/traces). */
export function getTraceCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes("/v1/traces"))
    .map((c) => {
      const opts = c[1] as { body?: string };
      try {
        return opts?.body ? JSON.parse(opts.body) : undefined;
      } catch {
        return opts?.body;
      }
    });
}

/** Get the URLs that fetch was called with. */
export function getFetchUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

/** Count how many times fetch was called. */
export function getFetchCallCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.length;
}

/** Check if fetch was ever called (at all). */
export function wasFetchCalled(fetchMock: ReturnType<typeof vi.fn>): boolean {
  return fetchMock.mock.calls.length > 0;
}

/** Check if fetch was called for a specific URL pattern. */
export function wasFetchCalledForUrl(fetchMock: ReturnType<typeof vi.fn>, urlPattern: string | RegExp): boolean {
  return fetchMock.mock.calls.some((c) => {
    const url = String(c[0]);
    return typeof urlPattern === "string" ? url.includes(urlPattern) : urlPattern.test(url);
  });
}

/** Get all console.error calls during a test. */
export function getConsoleErrors(errorSpy: ReturnType<typeof vi.fn>): string[] {
  return errorSpy.mock.calls.map((c) => c.map((arg: unknown) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" "));
}

/** Mock fetch that returns success for all calls. */
export function mockFetch() {
  return vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({}),
  }));
}

/** Mock fetch that fails with a network error on every call. */
export function mockFailingFetch(error?: Error) {
  const err = error ?? new Error("Network error: Connection refused");
  return vi.fn().mockImplementation(async () => {
    throw err;
  });
}

/** Mock fetch that returns HTTP error status on every call. */
export function mockHttpErrorFetch(status: number, statusText?: string) {
  return vi.fn().mockImplementation(async () => ({
    ok: false,
    status,
    statusText: statusText ?? `HTTP ${status}`,
    text: async () => `{"error": "${statusText ?? "Bad Request"}"}`,
    json: async () => ({ error: statusText ?? "Bad Request" }),
  }));
}

/** Mock fetch that fails a specified number of times then succeeds. */
export function mockFlakyFetch(failCount: number, error?: Error) {
  let attempts = 0;
  const err = error ?? new Error("Network error: Connection refused");
  return vi.fn().mockImplementation(async () => {
    attempts++;
    if (attempts <= failCount) {
      throw err;
    }
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({}),
    };
  });
}

/** Mock fetch that returns a delayed response (simulates timeout-prone scenarios). */
export function mockSlowFetch(delayMs: number, shouldSucceed = true) {
  return vi.fn().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    if (!shouldSucceed) {
      throw new Error("Request timed out");
    }
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({}),
    };
  });
}

/** Wait for a specified duration (useful for timer-based flush tests). */
export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Capture all unhandled promise rejections during a test. */
export function captureRejection(): { rejections: unknown[]; stop: () => void } {
  const rejections: unknown[] = [];
  const handler = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", handler);
  return {
    rejections,
    stop: () => process.off("unhandledRejection", handler),
  };
}
