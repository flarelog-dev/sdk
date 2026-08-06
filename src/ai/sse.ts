/**
 * Runtime-agnostic SSE (Server-Sent Events) chunk parser.
 *
 * The fetch interceptor uses this to walk streaming AI responses from
 * OpenAI/Anthropic without buffering the entire body. It works on top of
 * a `ReadableStream<Uint8Array>` (the standard web stream type, available
 * in both Cloudflare Workers and Node 18+).
 *
 * Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
 *
 * Key behaviors:
 * - Splits the byte stream into text-decoded "events" delimited by blank
 *   lines (\n\n or \r\n\r\n).
 * - Within an event, extracts the `data:` field(s) and concatenates them
 *   with newlines.
 * - Handles the `[DONE]` sentinel that OpenAI sends to terminate streams.
 * - Handles partial events across chunk boundaries (a single SSE event
 *   may arrive in multiple ReadableStream chunks).
 * - Decodes UTF-8 using `TextDecoder` with `stream: true` to handle
 *   multi-byte characters split across chunks.
 */

export interface SSEEvent {
  /** The concatenated `data:` field value (without the `data: ` prefix). */
  data: string;
  /** The event type, if an `event:` field was present. */
  event?: string;
  /** The ID, if an `id:` field was present. */
  id?: string;
}

/**
 * Parse a complete SSE stream into events.
 *
 * This is the simpler API — use when you have the full body as a string
 * (e.g. when interception buffers for tests).
 */
export function* parseSSEString(input: string): Generator<SSEEvent> {
  const blocks = input.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const event = parseSSEBlock(block);
    if (event) yield event;
  }
}

function parseSSEBlock(block: string): SSEEvent | null {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue; // comment or empty
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx);
    // Spec: strip a single leading space after the colon.
    let value = line.slice(colonIdx + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "data":
        dataLines.push(value);
        break;
      case "event":
        event = value;
        break;
      case "id":
        id = value;
        break;
      // ignore retry for our purposes
    }
  }

  if (dataLines.length === 0) return null;
  return { data: dataLines.join("\n"), event, id };
}

/**
 * Streaming SSE reader — async generator that yields parsed events as they
 * arrive from a ReadableStream.
 *
 * Handles partial events across chunk boundaries and partial UTF-8
 * sequences across chunk boundaries.
 *
 * @example
 * ```ts
 * for await (const event of readSSEStream(response.body)) {
 *   if (event.data === "[DONE]") break;
 *   const json = JSON.parse(event.data);
 *   // ... handle chunk
 * }
 * ```
 */
export async function* readSSEStream(
  stream: ReadableStream<Uint8Array> | null
): AsyncGenerator<SSEEvent, void, unknown> {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any trailing event in the buffer.
        if (buffer.trim()) {
          const event = parseSSEBlock(buffer);
          if (event) yield event;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split on event boundaries. Keep the trailing partial in the buffer.
      let boundaryIdx: number;
      while ((boundaryIdx = findEventBoundary(buffer)) !== -1) {
        const block = buffer.slice(0, boundaryIdx);
        buffer = buffer.slice(boundaryIdx).replace(/^(\r?\n){2}/, "");

        const event = parseSSEBlock(block);
        if (event) yield event;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released — ignore.
    }
  }
}

/**
 * Find the index of the next SSE event boundary (a blank line) in the
 * buffer. Returns -1 if none found.
 *
 * Handles both `\n\n` and `\r\n\r\n` sequences.
 */
function findEventBoundary(buffer: string): number {
  const rn = buffer.indexOf("\r\n\r\n");
  const n = buffer.indexOf("\n\n");
  if (rn === -1) return n;
  if (n === -1) return rn;
  return Math.min(rn, n);
}

/**
 * Returns true if the given SSE event's data is the OpenAI stream
 * termination sentinel (`[DONE]`).
 */
export function isStreamDone(event: SSEEvent): boolean {
  return event.data.trim() === "[DONE]";
}
