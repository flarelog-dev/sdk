/**
 * Ambient fallback types for `@tanstack/react-start`.
 *
 * `@tanstack/react-start` is an optional peer dependency. When the real
 * package is installed in a consumer project, TypeScript resolves the import
 * against the real type declarations and these ambient types are ignored.
 * This shim only exists so this SDK's own `tsc --noEmit` / `tsup` dts build
 * can typecheck without the RC framework installed in this repo.
 *
 * It intentionally mirrors only the subset of the builder API used by
 * `src/frameworks/tanstack-start.ts`. It is NOT a complete representation of
 * TanStack Start's types.
 */
declare module "@tanstack/react-start" {
  export interface ServerMiddlewareNextResult<C = any> {
    status?: number;
    context: C;
    [key: string]: unknown;
  }

  export interface ServerMiddlewareContext<C = any> {
    request: Request;
    context: C;
    data?: unknown;
    next(options?: {
      context?: Record<string, unknown>;
      sendContext?: Record<string, unknown>;
      headers?: Record<string, string>;
    }): Promise<ServerMiddlewareNextResult<C>>;
  }

  export interface MiddlewareBuilder {
    server<R>(
      fn: (
        ctx: ServerMiddlewareContext,
      ) => Promise<R> | R,
    ): this;
    middleware(deps?: unknown[]): this;
    client(fn: (ctx: any) => any): this;
    validator(fn: (data: unknown) => unknown): this;
  }

  export function createMiddleware(opts?: {
    type?: "request" | "function";
  }): MiddlewareBuilder;
}
