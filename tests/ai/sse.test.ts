/**
 * Tests for the SSE (Server-Sent Events) parser.
 */
import { describe, it, expect } from "vitest";
import { parseSSEString, readSSEStream, isStreamDone } from "../../src/ai/sse";

describe("parseSSEString", () => {
  it("parses a single event", () => {
    const input = "data: hello world\n\n";
    const events = [...parseSSEString(input)];
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello world");
  });

  it("parses multiple events", () => {
    const input = "data: first\n\ndata: second\n\ndata: third\n\n";
    const events = [...parseSSEString(input)];
    expect(events).toHaveLength(3);
    expect(events[0].data).toBe("first");
    expect(events[1].data).toBe("second");
    expect(events[2].data).toBe("third");
  });

  it("handles \\r\\n\\r\\n boundaries", () => {
    const input = "data: hello\r\n\r\ndata: world\r\n\r\n";
    const events = [...parseSSEString(input)];
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe("hello");
    expect(events[1].data).toBe("world");
  });

  it("concatenates multiple data: lines with newlines", () => {
    const input = "data: line1\ndata: line2\ndata: line3\n\n";
    const events = [...parseSSEString(input)];
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2\nline3");
  });

  it("strips a single leading space after the colon", () => {
    const input = "data:  two spaces\n\n";
    const events = [...parseSSEString(input)];
    expect(events[0].data).toBe(" two spaces"); // only one space stripped
  });

  it("preserves the event: field", () => {
    const input = "event: message\ndata: hello\n\n";
    const events = [...parseSSEString(input)];
    expect(events[0].event).toBe("message");
    expect(events[0].data).toBe("hello");
  });

  it("preserves the id: field", () => {
    const input = "id: 42\ndata: hello\n\n";
    const events = [...parseSSEString(input)];
    expect(events[0].id).toBe("42");
  });

  it("ignores comments (lines starting with :)", () => {
    const input = ": this is a comment\ndata: hello\n\n";
    const events = [...parseSSEString(input)];
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });

  it("skips blocks without a data: field", () => {
    const input = "event: foo\n\n";
    const events = [...parseSSEString(input)];
    expect(events).toHaveLength(0);
  });

  it("handles JSON data", () => {
    const json = JSON.stringify({ choices: [{ delta: { content: "Hi" } }] });
    const input = `data: ${json}\n\n`;
    const events = [...parseSSEString(input)];
    expect(events[0].data).toBe(json);
  });

  it("handles the [DONE] sentinel", () => {
    const input = "data: [DONE]\n\n";
    const events = [...parseSSEString(input)];
    expect(events[0].data).toBe("[DONE]");
    expect(isStreamDone(events[0])).toBe(true);
  });
});

describe("readSSEStream", () => {
  it("reads events from a ReadableStream", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode("data: first\n\ndata: sec"),
      encoder.encode("ond\n\ndata: third\n\n"),
    ];
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(c));
        controller.close();
      },
    });

    const events = [];
    for await (const event of readSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect(events[0].data).toBe("first");
    expect(events[1].data).toBe("second");
    expect(events[2].data).toBe("third");
  });

  it("handles partial events across chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode("data: hel"),
      encoder.encode("lo\n"),
      encoder.encode("\n"),
    ];
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(c));
        controller.close();
      },
    });

    const events = [];
    for await (const event of readSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });

  it("handles UTF-8 split across chunks", async () => {
    // "héllo" — the é is 2 bytes in UTF-8 (0xC3 0xA9)
    // Split the bytes so 0xC3 is at end of one chunk, 0xA9 at start of next
    const encoder = new TextEncoder();
    const fullBytes = encoder.encode("data: héllo\n\n");
    // Find the position of 0xC3 (the first byte of é)
    const splitIdx = fullBytes.indexOf(0xc3);

    const chunks = [fullBytes.slice(0, splitIdx + 1), fullBytes.slice(splitIdx + 1)];
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(c));
        controller.close();
      },
    });

    const events = [];
    for await (const event of readSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("héllo");
  });

  it("returns nothing for null stream", async () => {
    const events = [];
    for await (const event of readSSEStream(null)) {
      events.push(event);
    }
    expect(events).toHaveLength(0);
  });

  it("flushes trailing event in buffer at stream end", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: trailing\n\n"));
        controller.close();
      },
    });

    const events = [];
    for await (const event of readSSEStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("trailing");
  });
});

describe("isStreamDone", () => {
  it("returns true for [DONE]", () => {
    expect(isStreamDone({ data: "[DONE]" })).toBe(true);
  });

  it("returns true for [DONE] with whitespace", () => {
    expect(isStreamDone({ data: "  [DONE]  " })).toBe(true);
  });

  it("returns false for other data", () => {
    expect(isStreamDone({ data: '{"content":"hi"}' })).toBe(false);
  });
});
