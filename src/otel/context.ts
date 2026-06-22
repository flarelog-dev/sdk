import type { Context, Span, SpanContext } from "./types";

const SPAN_KEY = Symbol("flarelog.span");

export const ROOT_CONTEXT: Context = new Map();

let contextManager: ContextManager | undefined;

export interface ContextManager {
  active(): Context;
  with<A extends unknown[], F extends (...args: A) => unknown>(
    context: Context,
    fn: F,
    thisArg?: unknown,
    ...args: A
  ): ReturnType<F>;
}

class StackContextManager implements ContextManager {
  private stack: Context[] = [ROOT_CONTEXT];

  active(): Context {
    return this.stack[this.stack.length - 1] ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => unknown>(
    context: Context,
    fn: F,
    thisArg?: unknown,
    ...args: A
  ): ReturnType<F> {
    this.stack.push(context);
    try {
      return fn.call(thisArg, ...args) as ReturnType<F>;
    } finally {
      this.stack.pop();
    }
  }
}

class AsyncContextManager implements ContextManager {
  private als: { getStore(): Context | undefined; run<R>(store: Context, callback: (...args: unknown[]) => R, ...args: unknown[]): R };

  constructor(alsCtor: new <T>() => { getStore(): T | undefined; run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R }) {
    this.als = new alsCtor<Context>();
  }

  active(): Context {
    return this.als.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => unknown>(
    context: Context,
    fn: F,
    thisArg?: unknown,
    ...args: A
  ): ReturnType<F> {
    return this.als.run(context, fn as unknown as (...args: unknown[]) => ReturnType<F>, thisArg, ...args) as ReturnType<F>;
  }
}

export function ensureContextManager(): ContextManager {
  if (contextManager) return contextManager;
  try {
    const g = globalThis as { AsyncLocalStorage?: new <T>() => { getStore(): T | undefined; run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R } };
    if (g.AsyncLocalStorage) {
      contextManager = new AsyncContextManager(g.AsyncLocalStorage);
    } else {
      contextManager = new StackContextManager();
    }
  } catch {
    contextManager = new StackContextManager();
  }
  return contextManager;
}

export function activeContext(): Context {
  return ensureContextManager().active();
}

export function withContext<A extends unknown[], F extends (...args: A) => unknown>(
  context: Context,
  fn: F,
  thisArg?: unknown,
  ...args: A
): ReturnType<F> {
  return ensureContextManager().with(context, fn, thisArg, ...args);
}

export function setSpan(context: Context, span: Span): Context {
  const ctx = new Map(context);
  ctx.set(SPAN_KEY, span);
  return ctx;
}

export function getSpan(context: Context): Span | undefined {
  return context.get(SPAN_KEY) as Span | undefined;
}

export function getSpanContext(context: Context): SpanContext | undefined {
  const span = getSpan(context);
  return span?.spanContext();
}
