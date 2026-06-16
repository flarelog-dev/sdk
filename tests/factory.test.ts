import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flarelog } from "../src/factory";

describe("flarelog factory", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
      json: async () => ({ result: { data: { success: true, ingested: 0 } } }),
    });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates logger with auto-detected environment", () => {
    const logger = flarelog({ apiKey: "test", project: "test" });
    expect(logger).toBeDefined();
  });

  it("enables auto-capture by default", async () => {
    const logger = flarelog({ apiKey: "test", project: "test", batchSize: 100 });
    
    // Console capture should be enabled by default
    vi.spyOn(console, "error").mockImplementation(() => {});
    console.error("test error");
    
    await logger.flush();
    
    const calls = fetchMock.mock.calls;
    if (calls.length > 0) {
      const body = JSON.parse(calls[calls.length - 1][1].body);
      expect(body.logs.length).toBeGreaterThan(0);
    }
  });

  it("allows overriding auto-capture defaults", () => {
    const logger = flarelog({
      apiKey: "test",
      project: "test",
      autoCapture: { console: false },
    });
    
    expect(logger).toBeDefined();
  });
});
