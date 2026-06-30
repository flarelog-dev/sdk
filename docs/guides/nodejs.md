# FlareLog SDK - Node.js Guide

Server-side logging for Node.js — Express, Fastify, NestJS, and raw HTTP servers. The SDK auto-detects Node.js, reads `process.env.FLARELOG_API_KEY` at module load (safe on Node), and uses a 5-second batch flush interval for high-throughput logging.

> **Using Express?** See the [Express integration](/getting-started/installation#express-js) for the `expressMiddleware` + `expressErrorHandler` quick start. This guide covers broader Node.js patterns, custom servers, and advanced configuration.

## Quick Start (3 lines)

```typescript
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY, });

app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));
```

The `flarelog()` factory auto-detects environment, release, and serverName.

## Express.js

```typescript
import express from "express";
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY, });

const app = express();

// 2-line setup for request logging + error handling
app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));

// Routes - req.logger is automatically available
app.get("/api/users/:id", async (req, res) => {
  try {
    req.logger.info("Fetching user", { userId: req.params.id });
    
    const user = await db.users.findById(req.params.id);
    
    if (!user) {
      req.logger.warn("User not found", { userId: req.params.id });
      return res.status(404).json({ error: "Not found" });
    }
    
    req.logger.info("User fetched", { userId: user.id });
    res.json(user);
  } catch (err) {
    req.logger.logError(err, { message: "Failed to fetch user" });
    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(3000, () => {
  logger.info("Server started", { port: 3000 });
});
```

### Fastify

```typescript
import fastify from "fastify";
import { FlareLog } from "@flarelog/sdk";
import { randomUUID } from "node:crypto";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  environment: process.env.NODE_ENV,
  autoCapture: {
    console: true,
    globalErrors: true,
  },
});

const app = fastify({
  logger: false, // Disable Fastify's built-in logger
});

// Hook for request logging
app.addHook("onRequest", async (request, reply) => {
  const traceId = request.headers["x-trace-id"] || crypto.randomUUID();
  request.traceId = traceId;
  
  request.log = logger.child({
    source: "fastify",
    traceId,
    method: request.method,
    url: request.url,
  });
  
  request.log.info("Request started");
});

app.addHook("onResponse", async (request, reply) => {
  request.log?.info("Request completed", {
    status: reply.statusCode,
    durationMs: reply.elapsedTime,
  });
});

app.setErrorHandler((error, request, reply) => {
  request.log?.logError(error, {
    message: "Fastify error",
    metadata: {
      path: request.url,
      method: request.method,
    },
  });
  
  reply.status(500).send({ error: "Internal error" });
});

app.get("/api/health", async (request, reply) => {
  request.log.info("Health check");
  return { status: "ok" };
});

app.listen({ port: 3000 }, (err) => {
  if (err) {
    logger.logError(err, { message: "Failed to start server" });
    process.exit(1);
  }
  logger.info("Server started", { port: 3000 });
});
```

### Hono

```typescript
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

const app = new Hono();

app.use(honoMiddleware(logger));

app.get("/api/users/:id", async (c) => {
  const log = c.get("logger");
  const userId = c.req.param("id");

  log.info("Fetching user", { userId });

  try {
    const user = await db.users.findById(userId);
    if (!user) {
      log.warn("User not found", { userId });
      return c.json({ error: "Not found" }, 404);
    }
    log.info("User fetched", { userId });
    return c.json(user);
  } catch (err) {
    log.logError(err, { message: "Failed to fetch user", metadata: { userId } });
    return c.json({ error: "Internal error" }, 500);
  }
});

export default app;
```

### NestJS

```typescript
// flarelog.service.ts
import { Injectable } from "@nestjs/common";
import { FlareLog } from "@flarelog/sdk";

@Injectable()
export class FlareLogService {
  private logger: FlareLog;
  
  constructor() {
    this.logger = new FlareLog({
      apiKey: process.env.FLARELOG_API_KEY!,
      environment: process.env.NODE_ENV,
      autoCapture: {
        console: true,
        globalErrors: true,
      },
    });
  }
  
  getLogger() {
    return this.logger;
  }
  
  createChild(context: Record<string, unknown>) {
    return this.logger.child(context);
  }
}

// flarelog.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { FlareLogService } from "./flarelog.service";

import { randomUUID } from "node:crypto";

@Injectable()
export class FlareLogInterceptor implements NestInterceptor {
  constructor(private flarelogService: FlareLogService) {}
  
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const traceId = request.headers["x-trace-id"] || randomUUID();
    
    const logger = this.flarelogService.createChild({
      source: "nestjs",
      traceId,
      controller: context.getClass().name,
      handler: context.getHandler().name,
    });
    
    request.logger = logger;
    
    const start = Date.now();
    
    return next.handle().pipe(
      tap({
        next: (data) => {
          logger.info("Request completed", {
            durationMs: Date.now() - start,
          });
        },
        error: (error) => {
          logger.logError(error, {
            message: "Request failed",
            metadata: {
              durationMs: Date.now() - start,
            },
          });
        },
      })
    );
  }
}

// flarelog.exception-filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { FlareLogService } from "./flarelog.service";

@Catch()
export class FlareLogExceptionFilter implements ExceptionFilter {
  constructor(private flarelogService: FlareLogService) {}
  
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    
    const logger = request.logger || this.flarelogService.getLogger();
    
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      
      if (status >= 500) {
        logger.logError(exception, {
          message: "Server error",
          metadata: { status },
        });
      } else {
        logger.warn(exception.message, { status });
      }
      
      response.status(status).json(exception.getResponse());
    } else {
      logger.logError(exception, { message: "Unhandled exception" });
      response.status(500).json({ error: "Internal server error" });
    }
  }
}

// app.module.ts
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, APP_FILTER } from "@nestjs/core";
import { FlareLogService } from "./flarelog/flarelog.service";
import { FlareLogInterceptor } from "./flarelog/flarelog.interceptor";
import { FlareLogExceptionFilter } from "./flarelog/flarelog.exception-filter";

@Module({
  providers: [
    FlareLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: FlareLogInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: FlareLogExceptionFilter,
    },
  ],
  exports: [FlareLogService],
})
export class AppModule {}

// users.controller.ts
import { Controller, Get, Param } from "@nestjs/common";
import { FlareLogService } from "../flarelog/flarelog.service";

@Controller("users")
export class UsersController {
  constructor(private flarelogService: FlareLogService) {}
  
  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req) {
    req.logger.info("Fetching user", { userId: id });
    
    const user = await this.usersService.findById(id);
    
    if (!user) {
      req.logger.warn("User not found", { userId: id });
      throw new NotFoundException();
    }
    
    return user;
  }
}
```

### Koa

```typescript
import Koa from "koa";
import Router from "@koa/router";
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  environment: process.env.NODE_ENV,
  autoCapture: {
    console: true,
    globalErrors: true,
  },
});

const app = new Koa();
const router = new Router();

// Request logging middleware
app.use(async (ctx, next) => {
  const traceId = ctx.get("x-trace-id") || crypto.randomUUID();
  
  ctx.logger = logger.child({
    source: "koa",
    traceId,
    method: ctx.method,
    path: ctx.path,
  });
  
  const start = Date.now();
  
  try {
    await next();
  } catch (err) {
    ctx.logger.logError(err, { message: "Koa error" });
    ctx.status = 500;
    ctx.body = { error: "Internal error" };
  }
  
  const duration = Date.now() - start;
  ctx.logger.info("Request completed", {
    status: ctx.status,
    durationMs: duration,
  });
});

router.get("/api/users/:id", async (ctx) => {
  ctx.logger.info("Fetching user", { userId: ctx.params.id });
  
  const user = await db.users.findById(ctx.params.id);
  
  if (!user) {
    ctx.logger.warn("User not found");
    ctx.status = 404;
    return;
  }
  
  ctx.body = user;
});

app.use(router.routes());
app.listen(3000, () => {
  logger.info("Server started", { port: 3000 });
});
```

## Background Jobs

```typescript
import { FlareLog } from "@flarelog/sdk";
import { Queue, Worker } from "bullmq";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  environment: process.env.NODE_ENV,
});

// Job processor
const worker = new Worker("email-queue", async (job) => {
  const jobLogger = logger.child({
    source: "worker",
    jobId: job.id,
    jobName: job.name,
  });
  
  jobLogger.info("Processing job", { data: job.data });
  
  try {
    await sendEmail(job.data);
    jobLogger.info("Job completed");
  } catch (err) {
    jobLogger.logError(err, { message: "Job failed" });
    throw err; // Let BullMQ handle retry
  }
});

// Cron job
import { CronJob } from "cron";

const cleanupJob = new CronJob("0 0 * * *", async () => {
  logger.info("Cleanup job started");
  
  try {
    await cleanupOldData();
    logger.info("Cleanup job completed");
  } catch (err) {
    logger.logError(err, { message: "Cleanup job failed" });
  }
});

cleanupJob.start();
```

## CLI Tools

```typescript
#!/usr/bin/env node
import { FlareLog } from "@flarelog/sdk";
import { Command } from "commander";
import os from "node:os";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  environment: "cli",
  serverName: os.hostname(),
});

const program = new Command();

program
  .command("process <file>")
  .description("Process a file")
  .action(async (file) => {
    logger.info("Processing file", { file });
    
    try {
      await processFile(file);
      logger.info("File processed", { file });
    } catch (err) {
      logger.logError(err, { message: "Processing failed", metadata: { file } });
      process.exit(1);
    }
  });

program.parse();
```

## Graceful Shutdown

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info("Shutting down", { signal });
  
  try {
    // Close connections
    await db.close();
    await redis.quit();
    
    // Flush logs
    await logger.flush();
    
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.logError(err, { message: "Shutdown error" });
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Uncaught errors
process.on("uncaughtException", (err) => {
  logger.logError(err, { message: "Uncaught exception" });
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.logError(reason, { message: "Unhandled rejection" });
});
```

## Database Integration

```typescript
// Prisma middleware
import { PrismaClient } from "@prisma/client";
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
});

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const start = Date.now();
  
  try {
    const result = await next(params);
    
    logger.debug("Prisma query", {
      model: params.model,
      action: params.action,
      durationMs: Date.now() - start,
    });
    
    return result;
  } catch (err) {
    logger.logError(err, {
      message: "Prisma error",
      metadata: {
        model: params.model,
        action: params.action,
      },
    });
    throw err;
  }
});

// Mongoose
import mongoose from "mongoose";

mongoose.connection.on("error", (err) => {
  logger.logError(err, { message: "MongoDB connection error" });
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});
```

## Testing

```typescript
// test/setup.ts
import { FlareLog } from "@flarelog/sdk";

// Mock FlareLog in tests
jest.mock("@flarelog/sdk", () => ({
  FlareLog: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    logError: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      logError: jest.fn(),
    }),
    flush: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Or use a test transport
const testLogger = new FlareLog({
  apiKey: "test-key",
  endpoint: "http://localhost:9999", // Mock server
});
```

## Environment Variables

The SDK reads the following environment variables when you use the `flarelog()`
factory or omit the equivalent config option:

| Variable | Config option | Description |
| -------- | ------------- | ----------- |
| `FLARELOG_API_KEY` | `apiKey` | Flarelog hosted-backend API key |
| `FLARELOG_ENDPOINT` | `endpoint` | Flarelog endpoint (default `https://flarelog.dev`) |
| `FLARELOG_ENVIRONMENT` | `environment` | Deployment environment name |
| `FLARELOG_RELEASE` | `release` | Release version or git SHA |
| `FLARELOG_SERVER_NAME` | `serverName` | Host or instance name |
| `OTEL_SERVICE_NAME` | `serviceName` | OpenTelemetry service name |
| `OTEL_RESOURCE_ATTRIBUTES` | `resourceAttributes` | Extra OTel resource attributes (`key=value,key2=value2`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `otlpEndpoint` | OTLP/HTTP base endpoint for fan-out |
| `OTEL_EXPORTER_OTLP_HEADERS` | `otlpHeaders` | OTLP headers (`Key=Value,Key2=Value2`) |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | — | Override OTLP logs endpoint |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | — | Override OTLP traces endpoint |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | — | OTLP protocol (`http/protobuf` or `http/json`) |

```bash
# .env
FLARELOG_API_KEY=fl_your_api_key
FLARELOG_ENVIRONMENT=production
FLARELOG_RELEASE=1.2.3
```

```typescript
// config.ts
import { FlareLog } from "@flarelog/sdk";
import os from "node:os";

export const logger = new FlareLog({
  apiKey: process.env.FLARELOG_API_KEY!,
  environment: process.env.FLARELOG_ENVIRONMENT,
  release: process.env.FLARELOG_RELEASE,
  serverName: os.hostname(),
});
```

## Best Practices

1. **Use child loggers per request**: Attach trace IDs and request context
2. **Log at appropriate levels**: Use debug for details, info for operations, error for failures
3. **Include context**: Always log relevant IDs (userId, orderId, etc.)
4. **Set user context**: Identify users when authenticated
5. **Use breadcrumbs**: Track operations leading to errors
6. **Configure beforeSend**: Scrub PII and sensitive data
7. **Flush on shutdown**: Ensure all logs are sent before process exits
8. **Monitor log volume**: Use sampleRate to control costs in high-traffic apps
