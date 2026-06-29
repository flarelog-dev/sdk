/**
 * Ambient fallback types for `@tanstack/react-start` v1.
 *
 * `@tanstack/react-start` is an optional peer dependency. When the real
 * package is installed in a consumer project, TypeScript resolves the import
 * against the real type declarations and these ambient types are ignored.
 * This shim only exists so this SDK's own `tsc --noEmit` / `tsup` dts build
 * can typecheck without the framework installed in this repo.
 *
 * It mirrors the subset of the v1 API used by `src/frameworks/tanstack-start.ts`:
 *   - `createMiddleware()` returns a builder whose `.server(fn)` callback
 *     receives `RequestServerOptions` and returns `RequestMiddlewareServerFnResult`.
 *   - `next()` returns `RequestServerResult` shaped `{ request, pathname,
 *     context, response }` — there is NO top-level `status` field; the HTTP
 *     status lives on `result.response.status`. `next()` may also return a
 *     raw `Response` (short-circuit case).
 *   - `createStart(getOptions)` accepts `{ requestMiddleware?, functionMiddleware?,
 *     defaultSsr?, serverFns? }`.
 *
 * This is NOT a complete representation of TanStack Start's types — see the
 * real package for the full surface.
 */
declare module "@tanstack/react-start" {
  export interface RequestServerResult<C = any> {
    request: Request;
    pathname: string;
    context: C;
    response: Response;
  }

  export interface RequestServerNextFnOptions<C = any> {
    context?: C;
    sendContext?: Record<string, unknown>;
  }

  export interface RequestServerOptions<C = any> {
    request: Request;
    pathname: string;
    context: C;
    next<C2 = undefined>(
      options?: RequestServerNextFnOptions<C2>,
    ): Promise<RequestServerResult<C2>>;
    /** Type of Start handler currently processing this request. */
    handlerType: "serverFn" | "router";
    /** Metadata about the server function being invoked (only for serverFn). */
    serverFnMeta?: unknown;
  }

  export interface MiddlewareBuilder {
    server<R>(
      fn: (ctx: RequestServerOptions) => Promise<R> | R,
    ): this;
    middleware(deps?: unknown[]): this;
    client(fn: (ctx: any) => any): this;
    validator(fn: (data: unknown) => unknown): this;
  }

  export function createMiddleware(opts?: {
    type?: "request" | "function";
  }): MiddlewareBuilder;

  export interface StartInstanceOptions {
    requestMiddleware?: ReadonlyArray<unknown>;
    functionMiddleware?: ReadonlyArray<unknown>;
    defaultSsr?: boolean | "data-only" | false;
  }

  export interface StartInstance {
    getOptions(): StartInstanceOptions;
    createMiddleware: typeof createMiddleware;
  }

  export function createStart(
    getOptions: () =>
      | StartInstanceOptions
      | Promise<StartInstanceOptions>,
  ): StartInstance;
}
