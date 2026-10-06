import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { FlarelogTransport, idempotencyKeyFor } from "../src/otel/flarelog-transport";
import { PermanentExportError, isPermanentExportError } from "../src/otel/transport";
import { mockFetch, mockHttpErrorFetch } from "./helpers";

/**
 * A rejected key, an exhausted quota, or an oversized batch cannot be fixed by
 * sending the same batch again. Before this, the batch processor put such a batch
 * back in the queue and replayed the refusal on every flush, and logged an error
 * into the host app's console each time.
 */

function keyOf(call: unknown[]): string {
  const init = call[1] as { headers: Record<string, string> };
  return init.headers["Idempotency-Key"];
}

describe("permanent HTTP failures are dropped, not replayed", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.FLARELOG_API_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function logger(onDrop = vi.fn()) {
    return {
      onDrop,
      log: new FlareLog({ apiKey: "fl_test_key", workerMode: false, flushIntervalMs: 600_000, onDrop }),
    };
  }

  it.each([401, 402, 403, 413])("HTTP %i is sent once, not retried, and the batch is dropped", async (status) => {
    const fetchMock = mockHttpErrorFetch(status);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { log, onDrop } = logger();

    log.info("one");
    log.info("two");
    await log.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(2);

    // Nothing was put back in the queue: a later flush has nothing to send.
    fetchMock.mockClear();
    await log.flush();
    expect(fetchMock).not.toHaveBeenCalled();

    log.destroy();
  });

  it("does not spam the host app's console.error", async () => {
    globalThis.fetch = mockHttpErrorFetch(402) as unknown as typeof fetch;
    const { log } = logger();

    for (let i = 0; i < 5; i++) {
      log.info(`msg ${i}`);
      await log.flush();
    }

    const sdkErrors = error.mock.calls.filter((c) => String(c[0]).includes("[FlareLog]"));
    expect(sdkErrors).toHaveLength(0);
    log.destroy();
  });

  it("explains a 402 once, in plain language, no matter how many batches are refused", async () => {
    globalThis.fetch = mockHttpErrorFetch(402) as unknown as typeof fetch;
    vi.useFakeTimers({ toFake: ["Date"] });
    const { log } = logger();

    for (let i = 0; i < 3; i++) {
      log.info(`msg ${i}`);
      await log.flush();
      vi.setSystemTime(Date.now() + 61_000); // past the pause, so each flush really sends
    }

    const quotaWarnings = warn.mock.calls.filter((c) => String(c[0]).includes("monthly log limit"));
    expect(quotaWarnings).toHaveLength(1);
    log.destroy();
  });

  it("names the key as the problem on 401", async () => {
    globalThis.fetch = mockHttpErrorFetch(401) as unknown as typeof fetch;
    const { log } = logger();

    log.info("x");
    await log.flush();

    expect(warn.mock.calls.some((c) => String(c[0]).includes("API key"))).toBe(true);
    log.destroy();
  });

  it("pauses after 401/402/403 so a stuck quota does not hit the network on every flush", async () => {
    const fetchMock = mockHttpErrorFetch(402);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.useFakeTimers({ toFake: ["Date"] });
    const { log, onDrop } = logger();

    log.info("first");
    await log.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    log.info("second");
    await log.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // paused: dropped without a request
    expect(onDrop).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 61_000);
    globalThis.fetch = mockFetch() as unknown as typeof fetch;
    const recovered = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    log.info("third");
    await log.flush();
    expect(recovered).toHaveBeenCalledTimes(1);

    log.destroy();
  });

  it("413 is not paused: the next, smaller batch is still sent", async () => {
    const fetchMock = mockHttpErrorFetch(413);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { log } = logger();

    log.info("big");
    await log.flush();
    log.info("small");
    await log.flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    log.destroy();
  });

  it.each([408, 429, 500, 503])("HTTP %i is still retried and the batch kept", async (status) => {
    const fetchMock = mockHttpErrorFetch(status);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { log, onDrop } = logger();

    log.info("keep me");
    await log.flush();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // transport-level retry
    expect(onDrop).not.toHaveBeenCalled();

    fetchMock.mockClear();
    await log.flush();
    expect(fetchMock).toHaveBeenCalled(); // the batch was re-queued

    // Drain the re-queued batch into a healthy endpoint so destroy() has nothing
    // left to flush into the next test's fetch mock.
    globalThis.fetch = mockFetch() as unknown as typeof fetch;
    await log.flush();
    log.destroy();
  });
});

describe("PermanentExportError", () => {
  it("is recognised by shape, so custom transports and bundled copies interoperate", () => {
    expect(isPermanentExportError(new PermanentExportError("x", 402))).toBe(true);
    expect(isPermanentExportError({ permanent: true })).toBe(true);
    expect(isPermanentExportError(new Error("plain"))).toBe(false);
    expect(isPermanentExportError(null)).toBe(false);
  });
});

describe("Idempotency-Key", () => {
  beforeEach(() => {
    delete process.env.FLARELOG_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const logRecord = (body: string) =>
    ({
      hrTime: [1_700_000_000, 0],
      hrTimeObserved: [1_700_000_000, 0],
      severityNumber: 9,
      severityText: "INFO",
      body,
      attributes: {},
      resource: { attributes: {} },
      instrumentationScope: { name: "t" },
    }) as never;

  it("is sent on every request, and fits the server's accepted format", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const transport = new FlarelogTransport({ apiKey: "fl_x" });

    await transport.exportLogs([logRecord("a")]);

    expect(keyOf(fetchMock.mock.calls[0])).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it("is identical across the transport's own retries of one batch", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, text: async () => "down" };
      return { ok: true, status: 200, text: async () => "" };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const transport = new FlarelogTransport({ apiKey: "fl_x" });

    await transport.exportLogs([logRecord("a")]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(keyOf(fetchMock.mock.calls[0])).toBe(keyOf(fetchMock.mock.calls[1]));
  });

  it("is identical when a processor re-sends the same batch after a failed export", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: async () => "down" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const transport = new FlarelogTransport({ apiKey: "fl_x", maxRetries: 0 });
    const batch = [logRecord("a"), logRecord("b")];

    await expect(transport.exportLogs(batch)).rejects.toThrow();
    await expect(transport.exportLogs(batch)).rejects.toThrow();

    expect(keyOf(fetchMock.mock.calls[0])).toBe(keyOf(fetchMock.mock.calls[1]));
  });

  it("differs between different batches", () => {
    expect(idempotencyKeyFor('{"a":1}')).not.toBe(idempotencyKeyFor('{"a":2}'));
    expect(idempotencyKeyFor("same")).toBe(idempotencyKeyFor("same"));
  });
});
