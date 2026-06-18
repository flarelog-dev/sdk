import type { FlareLog, FlareLogChild } from "../client";

// Inline types to avoid Express dependency
interface Request {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  ip?: string;
  logger?: FlareLog | FlareLogChild;
  traceId?: string;
}

interface Response {
  statusCode: number;
  on(event: string, callback: () => void): void;
}

interface NextFunction {
  (err?: Error): void;
}

/**
 * Express middleware for automatic request logging.
 * 
 * - Attaches `req.logger` with request context
 * - Logs request completion with duration and status
 * - Auto-generates traceId from header or crypto
 * 
 * @example
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * import { expressMiddleware } from "@flarelog/sdk/express";
 * 
 * const logger = flarelog({ apiKey, });
 * app.use(expressMiddleware(logger));
 * ```
 */
export function expressMiddleware(logger: FlareLog) {
  return (req: Request, res: Response, next: NextFunction) => {
    const traceId = (req.headers["x-trace-id"] as string) || crypto.randomUUID();
    req.traceId = traceId;

    const child = logger.child({
      source: "express",
      traceId,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    req.logger = child;

    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const level =
        res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
      
      child.log(level, "Request completed", {
        status: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  };
}

/**
 * Express error handler that logs errors to FlareLog.
 * Must be registered after all other middleware and routes.
 * 
 * @example
 * ```typescript
 * import { expressErrorHandler } from "@flarelog/sdk/express";
 * 
 * app.use(expressErrorHandler(logger));
 * ```
 */
export function expressErrorHandler(_logger: FlareLog) {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.logger?.logError(err, {
      message: "Express error",
      metadata: {
        path: req.path,
        method: req.method,
      },
    });

    res.statusCode = 500;
    (res as any).json({ error: "Internal server error" });
  };
}
