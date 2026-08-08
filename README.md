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

## AI Inference Observability

Zero-config instrumentation for OpenAI, Anthropic, Cloudflare Workers AI,
Vercel AI SDK, and any OpenAI-compatible gateway. Captures tokens, latency,
cost in USD, tool calls, and errors — viewable in the
[AI observability dashboard](https://flarelog.dev/ai-observability).

```typescript
import { flarelog } from "@flarelog/sdk";
import { flarelogAI } from "@flarelog/sdk/ai";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
flarelogAI(logger);

// Every fetch() to api.openai.com is now captured automatically.
```

Streaming OpenAI calls capture tokens when you enable usage reporting (Anthropic
and Workers AI capture usage automatically):

```typescript
await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model: "gpt-4o",
    stream: true,
    stream_options: { include_usage: true }, // ← required for streaming token capture
    messages: [{ role: "user", content: "Hello" }],
  }),
});
```

See the [AI Observability guide](docs/ai-observability/) for the full docs.

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