import type { FlareLog } from "../client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Next.js API route wrapper with automatic logging.
 * 
 * - Attaches `req.logger` with request context
 * - Logs request completion with duration and status
 * - Captures errors automatically
 * 
 * @example
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * import { withFlareLog } from "@flarelog/sdk/next";
 * 
 * const logger = flarelog({ apiKey, project: "api" });
 * 
 * export default withFlareLog(logger, async (req, res) => {
 *   req.logger.info("Processing request");
 *   const data = await fetchData();
 *   res.json(data);
 * });
 * ```
 */
export function withFlareLog<T>(
  logger: FlareLog,
  handler: (req: NextApiRequest & { logger: FlareLog; traceId: string }, res: NextApiResponse) => Promise<T>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const traceId = (req.headers["x-trace-id"] as string) || crypto.randomUUID();
    const child = logger.child({
      source: "nextjs",
      traceId,
      method: req.method,
      path: req.url,
    });

    (req as any).logger = child;
    (req as any).traceId = traceId;

    const start = Date.now();
    try {
      const result = await handler(req as any, res);
      const duration = Date.now() - start;
      child.info("API request completed", {
        status: res.statusCode,
        durationMs: duration,
      });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "API request failed",
        metadata: { durationMs: duration },
      });
      throw err;
    }
  };
}
