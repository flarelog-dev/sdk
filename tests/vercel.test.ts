/**
 * Unit tests for the Vercel integration.
 *
 * Covers:
 *   - withVercelServerless: traceId extraction, child logger attachment,
 *     res.on("finish") status logging, error capture + 500 response
 *   - withVercelEdge: Response status extraction, error capture + rethrow,
 *     FlareLog.withRequest delegation
 *   - detectVercelEnv: VERCEL env var detection, all VERCEL_* field mapping
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { mockFetch, wasFetchCalledForUrl } from "./helpers";
import {
  withVercelServerless,
  withVercelEdge,
  detectVercelEnv,
} from "../src/frameworks/vercel";

// ─── Inline Vercel stubs ───────────────────────────────────────────────────
// Mirror @vercel/node's VercelRequest / VercelResponse shape without
// importing the package (the SDK doesn't import it either — it uses inline
// types, so the stubs here ARE the contract).

interface FakeVercelRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[]>;
  body?: unknown;
  cookies?: Record<string, string>;
  logger?: unknown;
  traceId?: string;
}

interface FakeVercelResponse {
  statusCode: number;
  headersSent: boolean;
  listeners: Record<string, Array<() => void>>;
  status(code: number): FakeVercelResponse;
  json(data: unknown): FakeVercelResponse;
  send(data?: unknown): FakeVercelResponse;
  end(): FakeVercelResponse;
  setHeader(name: string, value: string | string[]): FakeVercelResponse;
  getHeader(name: string): string | string[] | undefined;
  on(event: string, cb: () => void): void;
  emit(event: string): void;
}

function makeRequest(
  overrides: Partial<FakeVercelRequest> = {},
): FakeVercelRequest {
  return {
    method: "GET",
    url: "/api/test",
    headers: {},
    query: {},
    ...overrides,
  };
}

function makeResponse(initialStatus = 200): FakeVercelResponse {
  const listeners: Record<string, Array<() => void>> = {};
  const res: FakeVercelResponse = {
    statusCode: initialStatus,
    headersSent: false,
    listeners,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.headersSent = true;
      this.emit("finish");
      return this;
    },
    send(data) {
      this.headersSent = true;
      this.emit("finish");
      return this;
    },
    end() {
      this.headersSent = true;
      this.emit("finish");
      return this;
    },
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    on(event, cb) {
      (listeners[event] ??= []).push(cb);
    },
    emit(event) {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
  };
  return res;
}

function makeLogger() {
  return new FlareLog({
    apiKey: "test-key",
    endpoint: "http://localhost:9999",
    allowInsecure: true,
    workerMode: true,
  });
}

// ─── withVercelServerless ──────────────────────────────────────────────────

describe("withVercelServerless", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches a child logger and traceId to req", async () => {
    const logger = makeLogger();
    const handler = withVercelServerless(logger, async (req) => {
      expect(req.traceId).toBe("trace-abc");
      expect(req.logger).toBeDefined();
      return;
    });
    const req = makeRequest({
      headers: { "x-trace-id": "trace-abc" },
    });
    const res = makeResponse();

    await handler(req as never, res as never);

    expect(req.traceId).toBe("trace-abc");
  });

  it("extracts traceId from W3C traceparent header", async () => {
    const logger = makeLogger();
    const handler = withVercelServerless(logger, async (req) => {
      // traceId is the second segment of traceparent: 00-<traceId>-<spanId>-01
      expect(req.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    });
    const req = makeRequest({
      headers: {
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      },
    });
    const res = makeResponse();

    await handler(req as never, res as never);
  });

  it("auto-generates a traceId when no header is present", async () => {
    const logger = makeLogger();
    const handler = withVercelServerless(logger, async (req) => {
      expect(req.traceId).toBeTruthy();
    });
    const req = makeRequest();
    const res = makeResponse();

    await handler(req as never, res as never);

    expect(req.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("logs request completion at the correct level based on status", async () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    const handler = withVercelServerless(logger, async (req, res) => {
      res.statusCode = 404;
      res.json({ error: "not found" });
    });
    const req = makeRequest();
    const res = makeResponse();

    await handler(req as never, res as never);

    expect(logSpy).toHaveBeenCalledWith(
      "WARN",
      "Vercel Serverless request completed",
      expect.objectContaining({ status: 404 }),
      expect.anything(),
    );
  });

  it("captures errors, sends 500, and re-throws", async () => {
    const logger = makeLogger();
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const handler = withVercelServerless(logger, async () => {
      throw new Error("handler crashed");
    });
    const req = makeRequest();
    const res = makeResponse();

    await expect(handler(req as never, res as never)).rejects.toThrow(
      "handler crashed",
    );

    expect(logErrorSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        message: "Vercel Serverless request failed",
      }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.headersSent).toBe(true);
  });

  it("flushes the logger after the handler completes", async () => {
    const logger = makeLogger();
    const flushSpy = vi.spyOn(logger, "flush").mockResolvedValue(undefined);
    const handler = withVercelServerless(logger, async () => {});
    const req = makeRequest();
    const res = makeResponse();

    await handler(req as never, res as never);

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── withVercelEdge ────────────────────────────────────────────────────────

describe("withVercelEdge", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a handler that delegates to FlareLog.withRequest", async () => {
    const logger = makeLogger();
    const withRequestSpy = vi
      .spyOn(logger, "withRequest")
      .mockImplementation(async (_ctx, _exec, fn) => fn());
    const handler = withVercelEdge(logger, async (request) => {
      return new Response("ok", { status: 200 });
    });

    const response = await handler(new Request("https://example.com/api"));

    expect(withRequestSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it("captures and re-throws errors from the handler", async () => {
    const logger = makeLogger();
    vi.spyOn(logger, "withRequest").mockImplementation(async (_c, _e, fn) => fn());
    const handler = withVercelEdge(logger, async () => {
      throw new Error("edge boom");
    });

    await expect(handler(new Request("https://example.com"))).rejects.toThrow(
      "edge boom",
    );
  });
});

// ─── detectVercelEnv ───────────────────────────────────────────────────────

describe("detectVercelEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore process.env after each test
    process.env = { ...originalEnv };
  });

  it("returns null when VERCEL is not set", () => {
    delete process.env.VERCEL;
    expect(detectVercelEnv()).toBeNull();
  });

  it("returns null when VERCEL is not '1'", () => {
    process.env.VERCEL = "0";
    expect(detectVercelEnv()).toBeNull();
  });

  it("detects Vercel and maps all VERCEL_* env vars", () => {
    process.env = {
      ...originalEnv,
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_REGION: "iad1",
      VERCEL_URL: "myapp-abc123.vercel.app",
      VERCEL_GIT_COMMIT_SHA: "abc123def456",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_PROJECT_ID: "prj_abc123",
      VERCEL_DEPLOYMENT_ID: "dpl_xyz789",
    };

    const result = detectVercelEnv();
    expect(result).toEqual({
      isVercel: true,
      environment: "production",
      region: "iad1",
      url: "myapp-abc123.vercel.app",
      commitSha: "abc123def456",
      commitRef: "main",
      projectId: "prj_abc123",
      deploymentId: "dpl_xyz789",
    });
  });

  it("defaults environment to 'development' when VERCEL_ENV is missing", () => {
    process.env = { ...originalEnv, VERCEL: "1" };
    const result = detectVercelEnv();
    expect(result?.environment).toBe("development");
  });

  it("fills missing fields with empty strings instead of undefined", () => {
    process.env = { ...originalEnv, VERCEL: "1" };
    const result = detectVercelEnv();
    expect(result).not.toBeNull();
    expect(result?.region).toBe("");
    expect(result?.url).toBe("");
    expect(result?.commitSha).toBe("");
    expect(result?.commitRef).toBe("");
    expect(result?.projectId).toBe("");
    expect(result?.deploymentId).toBe("");
  });
});
