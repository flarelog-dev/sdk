/**
 * Serialize an Error (or any thrown value) into a plain object safe for JSON.
 * Follows the Error Cause proposal (error.cause chain) for rich error context.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const result: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack?.split("\n").map((s) => s.trim()),
    };

    // Capture cause chain (ES2022+ Error Cause proposal)
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) {
      result.cause =
        cause instanceof Error ? serializeError(cause) : cause;
    }

    return result;
  }

  // Primitive thrown values (string, number, etc.)
  if (typeof err === "string") {
    return { message: err };
  }

  if (err === null || err === undefined) {
    return { message: "Unknown error (null or undefined thrown)" };
  }

  try {
    return { value: err };
  } catch {
    return { message: "Unserializable thrown value" };
  }
}

/**
 * Extract the deepest cause from an error chain.
 */
export function getRootCause(err: unknown): unknown {
  if (err instanceof Error && "cause" in err && err.cause !== undefined) {
    return getRootCause(err.cause);
  }
  return err;
}

/**
 * Check if a value looks like an Error instance (duck typing for cross-realm).
 */
export function isErrorLike(val: unknown): val is { name: string; message: string; stack?: string } {
  return (
    typeof val === "object" &&
    val !== null &&
    "message" in val &&
    typeof (val as Record<string, unknown>).message === "string"
  );
}

export function getErrorFingerprint(err: unknown): string {
  if (err instanceof Error) {
    const firstFrame = err.stack?.split("\n")[1]?.trim() ?? "";
    return `${err.name}:${err.message}:${firstFrame}`;
  }

  if (typeof err === "string") {
    return err;
  }

  if (err === null || err === undefined) {
    return "unknown";
  }

  try {
    return String(err);
  } catch {
    return "unserializable";
  }
}

export function buildConsoleError(args: unknown[]): Error {
  const firstError = args.find((a): a is Error => a instanceof Error);
  if (firstError) {
    return firstError;
  }

  const message = args
    .map((a) => (typeof a === "string" ? a : ""))
    .filter(Boolean)
    .join(" ") || "console output";

  return new Error(message);
}

export function serializeConsoleArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return serializeError(arg);
    }

    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.parse(JSON.stringify(arg));
      } catch {
        return String(arg);
      }
    }

    return arg;
  });
}

export function formatConsoleMessage(args: unknown[]): string {
  const text = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.message;
      return "";
    })
    .filter(Boolean)
    .join(" ");
  return text || "console output";
}
