/**
 * Unit tests for the React integration.
 *
 * Tests the FlareLogErrorBoundary and hooks WITHOUT a DOM environment
 * (no jsdom / @testing-library/react required). We exercise:
 *   - ErrorBoundary class methods directly (no render needed)
 *   - Hooks via react-dom/server's renderToStaticMarkup (executes the hook
 *     in a React render context without needing a DOM)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlareLogErrorBoundary, useFlareLog, useFlareLogPageView } from "../src/frameworks/react";
import { FlareLog } from "../src/client";
import { mockFetch } from "./helpers";

function makeLogger() {
  return new FlareLog({
    apiKey: "test-key",
    endpoint: "http://localhost:9999",
    allowInsecure: true,
    workerMode: true,
  });
}

// ─── FlareLogErrorBoundary ─────────────────────────────────────────────────

describe("FlareLogErrorBoundary", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getDerivedStateFromError", () => {
    it("sets hasError to true", () => {
      const state = FlareLogErrorBoundary.getDerivedStateFromError(
        new Error("test"),
      );
      expect(state).toEqual({ hasError: true });
    });
  });

  describe("componentDidCatch", () => {
    it("logs the error with componentStack and reactVersion", () => {
      const logger = makeLogger();
      const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
      const boundary = new FlareLogErrorBoundary({
        logger,
        children: React.createElement("div"),
      });

      const error = new Error("render crashed");
      const errorInfo = {
        componentStack: "\n    at BadComponent\n    at App",
      };
      boundary.componentDidCatch(error, errorInfo);

      expect(logErrorSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          message: "React error boundary caught error",
          metadata: expect.objectContaining({
            componentStack: errorInfo.componentStack,
            reactVersion: React.version,
          }),
        }),
      );
    });
  });

  describe("render", () => {
    it("renders children when hasError is false", () => {
      const logger = makeLogger();
      const child = React.createElement("div", null, "hello");
      const boundary = new FlareLogErrorBoundary({
        logger,
        children: child,
      });
      boundary.state = { hasError: false };

      const result = boundary.render();
      expect(result).toBe(child);
    });

    it("renders fallback when provided and hasError is true", () => {
      const logger = makeLogger();
      const fallback = React.createElement("div", null, "fallback UI");
      const boundary = new FlareLogErrorBoundary({
        logger,
        children: React.createElement("div"),
        fallback,
      });
      boundary.state = { hasError: true };

      const result = boundary.render() as React.ReactElement;
      // Compare by content, not reference — React.createElement returns a
      // new object each call, so `result === fallback` is always false.
      expect(result.type).toBe(fallback.type);
      expect(result.props.children).toBe("fallback UI");
    });

    it("renders default fallback when no fallback prop and hasError is true", () => {
      const logger = makeLogger();
      const child = React.createElement("div");
      const boundary = new FlareLogErrorBoundary({
        logger,
        children: child,
      });
      boundary.state = { hasError: true };

      const result = boundary.render() as React.ReactElement;
      // Should NOT be the original children — should be the default fallback.
      // Both are <div> elements, so we check the props to distinguish them:
      // the default fallback has an <h1> child, the original children don't.
      expect(result).not.toBe(child);
      expect(result.type).toBe("div");
      // Default fallback contains an <h1> with "Something went wrong"
      const children = result.props.children;
      const hasH1 = Array.isArray(children)
        ? children.some((c) => React.isValidElement(c) && c.type === "h1")
        : React.isValidElement(children) && children.type === "h1";
      expect(hasH1).toBe(true);
    });
  });
});

// ─── useFlareLog hook ──────────────────────────────────────────────────────

describe("useFlareLog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trackEvent, trackError, setUser, and addBreadcrumb callbacks", () => {
    const logger = makeLogger();
    let hookResult: ReturnType<typeof useFlareLog> | null = null;

    function TestComp() {
      hookResult = useFlareLog(logger);
      return null;
    }

    renderToStaticMarkup(React.createElement(TestComp));

    expect(hookResult).not.toBeNull();
    expect(typeof hookResult!.trackEvent).toBe("function");
    expect(typeof hookResult!.trackError).toBe("function");
    expect(typeof hookResult!.setUser).toBe("function");
    expect(typeof hookResult!.addBreadcrumb).toBe("function");
  });

  it("trackEvent calls logger.info with the event name and data", () => {
    const logger = makeLogger();
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    let hookResult: ReturnType<typeof useFlareLog> | null = null;

    function TestComp() {
      hookResult = useFlareLog(logger);
      return null;
    }

    renderToStaticMarkup(React.createElement(TestComp));

    hookResult!.trackEvent("button_clicked", { button: "checkout" });
    expect(infoSpy).toHaveBeenCalledWith("button_clicked", { button: "checkout" });
  });

  it("trackError calls logger.logError with the error and metadata", () => {
    const logger = makeLogger();
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    let hookResult: ReturnType<typeof useFlareLog> | null = null;

    function TestComp() {
      hookResult = useFlareLog(logger);
      return null;
    }

    renderToStaticMarkup(React.createElement(TestComp));

    const err = new Error("checkout failed");
    hookResult!.trackError(err, { step: "payment" });
    expect(logErrorSpy).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ metadata: { step: "payment" } }),
    );
  });

  it("setUser calls logger.setUser", () => {
    const logger = makeLogger();
    const setUserSpy = vi.spyOn(logger, "setUser").mockImplementation(() => {});
    let hookResult: ReturnType<typeof useFlareLog> | null = null;

    function TestComp() {
      hookResult = useFlareLog(logger);
      return null;
    }

    renderToStaticMarkup(React.createElement(TestComp));

    hookResult!.setUser({ id: "u1", email: "a@b.com" });
    expect(setUserSpy).toHaveBeenCalledWith({ id: "u1", email: "a@b.com" });
  });

  it("addBreadcrumb calls logger.addBreadcrumb", () => {
    const logger = makeLogger();
    const breadcrumbSpy = vi.spyOn(logger, "addBreadcrumb").mockImplementation(() => {});
    let hookResult: ReturnType<typeof useFlareLog> | null = null;

    function TestComp() {
      hookResult = useFlareLog(logger);
      return null;
    }

    renderToStaticMarkup(React.createElement(TestComp));

    hookResult!.addBreadcrumb({ category: "ui", message: "clicked" });
    expect(breadcrumbSpy).toHaveBeenCalledWith({
      category: "ui",
      message: "clicked",
    });
  });
});

// ─── useFlareLogPageView hook ──────────────────────────────────────────────

describe("useFlareLogPageView", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not crash during SSR (useEffect doesn't fire on server)", () => {
    const logger = makeLogger();

    function TestComp() {
      useFlareLogPageView(logger, "Home");
      return null;
    }

    // renderToStaticMarkup doesn't run useEffect on the server, so the hook
    // must not crash even though window.location isn't available. The actual
    // page-view log fires in a real browser.
    expect(() => {
      renderToStaticMarkup(React.createElement(TestComp));
    }).not.toThrow();
  });
});
