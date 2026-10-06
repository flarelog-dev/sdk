# Logging an MCP server

Use the SDK to see what your own MCP server is doing in production: which tools get called, which ones fail, and how long they take.

## The stdio rule: never write to stdout

A **stdio** MCP server speaks JSON-RPC over stdout. Any other line on stdout (a stray `console.log`, a library's debug output, or the SDK's own console fallback) corrupts the stream, and the client reports a vague parse error or silently drops the server.

If the SDK has no backend configured (no `FLARELOG_API_KEY`, no OTLP endpoint) it falls back to printing logs to the console, and that includes stdout. In an MCP server, always set `logToStderr`:

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY,
  logToStderr: true, // keep stdout clean for the MCP protocol
});
```

With `logToStderr: true`, the console transport writes every level to stderr. Logs shipped to FlareLog never touch stdout, so the option only matters when the console transport is in use, but it is a cheap guard against a missing API key in a client config.

Your own code should follow the same rule: use `logger.info(...)` or `console.error(...)`, not `console.log(...)`.

## Log every tool call

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

server.registerTool("lookup_order", { description: "Look up an order" }, async (args) => {
  const started = Date.now();
  try {
    const result = await lookupOrder(args.orderId);
    logger.info("tool call", {
      "mcp.tool.name": "lookup_order",
      "mcp.outcome": "ok",
      "mcp.duration_ms": Date.now() - started,
    });
    return result;
  } catch (err) {
    logger.error(err instanceof Error ? err.message : "tool failed", {
      "mcp.tool.name": "lookup_order",
      "mcp.outcome": "error",
      "mcp.duration_ms": Date.now() - started,
    });
    throw err;
  }
});
```

Log the tool name, outcome and duration. Avoid logging raw arguments or results unless you have checked they contain nothing sensitive; the SDK scrubs common secret field names (`password`, `token`, `authorization`, and so on), but cannot know what your tool arguments mean.

## Short-lived processes

A stdio server is usually started and stopped by the client. Flush on shutdown so the last logs are not lost:

```typescript
process.on("SIGINT", async () => {
  await logger.flush();
  process.exit(0);
});
```

## Remote (HTTP) servers on Cloudflare Workers

For a server on Workers, use the Workers helpers (see [Cloudflare Workers](/platforms/cloudflare-workers)); stdout is not an issue there.
