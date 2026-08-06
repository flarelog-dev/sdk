# @flarelog/sdk

**Zero-dependency observability for any JavaScript runtime.**

Ships logs, errors, and W3C-propagated traces from Cloudflare Workers, Vercel, Node.js, or the browser to FlareLog or any OTLP backend. One SDK, every platform.

[![npm version](https://img.shields.io/npm/v/@flarelog/sdk)](https://www.npmjs.com/package/@flarelog/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Documentation

**[docs.flarelog.dev](https://docs.flarelog.dev)**

Complete documentation with installation guides, API reference, framework integrations, and platform-specific setup.

---

## Quick Start

```bash
npm install @flarelog/sdk
```

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({});
logger.info("Hello!");  // → console (zero config)
```

Add your API key to ship to the dashboard:

```bash
FLARELOG_API_KEY=fl_your_key
```

---

## AI Inference Observability (new in 2.6)

Zero-config instrumentation for OpenAI, Anthropic, Cloudflare Workers AI,
Vercel AI SDK, and any OpenAI-compatible gateway. Captures tokens, latency,
cost in USD, tool calls, and errors.

```typescript
import { flarelog } from "@flarelog/sdk";
import { flarelogAI } from "@flarelog/sdk/ai";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
flarelogAI(logger);

// Every fetch() to api.openai.com is now captured automatically.
```

See the [AI Observability guide](docs/ai-observability/README.md) for the full docs.

---

## Features

- **Zero dependencies** — nothing to audit, nothing to conflict
- **Any JavaScript runtime** — Cloudflare Workers, Vercel, Node.js, browsers
- **W3C trace propagation** — distributed tracing across services
- **Auto-detection** — environment, release, platform
- **OTLP-compatible** — ships to Grafana, Honeycomb, Datadog, or any OTLP backend
- **AI inference observability** — zero-config token, cost, and latency tracking for OpenAI, Anthropic, Workers AI, Vercel AI SDK, and any OpenAI-compatible gateway

---

## License

MIT