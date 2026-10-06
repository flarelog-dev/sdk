import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { createOnRequestError } from "../src/frameworks/next";
import { attrsToObject, extractOtlpLogs, getLogCalls, mockFetch } from "./helpers";

const request = {
  path: "/dashboard/orders?token=secret-token&page=2",
  method: "GET",
  headers: { cookie: "session=abc", authorization: "Bearer xyz" },
};

const context = {
  routerKind: "App Router" as const,
  routePath: "/dashboard/orders",
  routeType: "render" as const,
  renderSource: "react-server-components" as const,
};

function appError(message: string, digest?: string) {
  const err = new Error(message) as Error & { digest?: string };
  err.digest = digest;
  return err;
}

describe("createOnRequestError (Next.js instrumentation.ts)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.FLARELOG_API_KEY;
  });
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const logger = new FlareLog({ apiKey: "fl_test", endpoint: "http://localhost:9999", allowInsecure: true, workerMode: true });
    return { logger, onRequestError: createOnRequestError(logger) };
  }

  async function sentRecord() {
    const logs = getLogCalls(fetchMock).flatMap((body) => extractOtlpLogs(body));
    expect(logs).toHaveLength(1);
    return { log: logs[0], attrs: attrsToObject(logs[0].attributes ?? []) };
  }

  it("ships the error with its digest, route and a readable message", async () => {
    const { onRequestError } = setup();

    await onRequestError(appError("Cannot read properties of undefined (reading 'plan')", "1389973523"), request, context);

    const { log, attrs } = await sentRecord();
    expect(log.severityText).toBe("ERROR");
    expect(log.body?.stringValue).toBe("Cannot read properties of undefined (reading 'plan')");
    expect(attrs["next.digest"]).toBe("1389973523");
    expect(attrs["next.route"]).toBe("/dashboard/orders");
    expect(attrs["next.route_type"]).toBe("render");
    expect(attrs["next.router_kind"]).toBe("App Router");
    expect(attrs["http.method"]).toBe("GET");
    expect(String(attrs["error.stack"])).toContain("Cannot read properties");
  });

  it("drops the query string and never sends request headers", async () => {
    const { onRequestError } = setup();

    await onRequestError(appError("boom", "1"), request, context);

    const body = JSON.stringify(getLogCalls(fetchMock));
    expect(body).toContain("/dashboard/orders");
    expect(body).not.toContain("secret-token");
    expect(body).not.toContain("Bearer xyz");
    expect(body).not.toContain("session=abc");
  });

  it("flushes before returning, because the invocation may be frozen right after", async () => {
    const logger = new FlareLog({ apiKey: "fl_test", endpoint: "http://localhost:9999", allowInsecure: true, workerMode: false, flushIntervalMs: 600_000 });
    const onRequestError = createOnRequestError(logger);

    await onRequestError(appError("boom", "2"), request, context);

    // Batch mode would still be buffering; the hook must have forced it out.
    expect(getLogCalls(fetchMock).length).toBeGreaterThan(0);
    logger.destroy();
  });

  it("handles errors without a digest and non-Error throwables", async () => {
    const { onRequestError } = setup();

    await onRequestError("plain string failure", request, context);

    const { log, attrs } = await sentRecord();
    expect(log.body?.stringValue).toBe("plain string failure");
    expect(attrs["next.digest"]).toBeUndefined();
  });

  it("never throws into Next.js, even when the logger does", async () => {
    const exploding = {
      error: () => {
        throw new Error("logger broke");
      },
      flush: async () => {},
    };

    await expect(createOnRequestError(exploding)(appError("x", "3"), request, context)).resolves.toBeUndefined();
  });

  it("tolerates a missing request or context", async () => {
    const { onRequestError } = setup();

    await expect(onRequestError(appError("x", "4"), undefined as never, undefined as never)).resolves.toBeUndefined();
  });
});
