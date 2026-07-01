---
layout: home

hero:
  name: FlareLog SDK
  text: Zero-dependency observability
  tagline: Ship logs, errors, and W3C traces from Cloudflare Workers, Vercel, Node.js, TanStack Start, or the browser to FlareLog or any OTLP backend.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: Choosing an Integration
      link: /getting-started/choosing-integration

features:
  - icon: 🚀
    title: Zero Dependencies
    details: No external runtime deps. Lightweight and fast for any JavaScript runtime — Node, Workers, Edge, browser.
  - icon: 📦
    title: Core API
    details: Complete logging, error handling, child loggers, breadcrumbs, sampling, and beforeSend hooks.
    link: /core-api/
    linkText: View API docs
  - icon: ⚡
    title: Cloudflare Workers
    details: Full OTel spans, workerFetch wrapper, ctx.waitUntil flush. Auto-detects Worker env bindings.
    link: /platforms/cloudflare-workers
    linkText: Learn more
  - icon: ▲
    title: Vercel
    details: Serverless Functions, Edge Functions, and Middleware with auto environment detection.
    link: /platforms/vercel
    linkText: Learn more
  - icon: ▲
    title: Next.js
    details: Drop-in wrappers for Pages Router, App Router Route Handlers, and Edge Middleware.
    link: /frameworks/nextjs
    linkText: Learn more
  - icon: 🌀
    title: TanStack Start
    details: Zero-config request middleware for TanStack Start v1. Auto-reads Worker env bindings on Lovable.
    link: /frameworks/tanstack-start
    linkText: Learn more
  - icon: 🔥
    title: Hono
    details: Hono middleware with auto-detection of Cloudflare Worker env bindings via c.env.
    link: /frameworks/hono
    linkText: Learn more
  - icon: ⚛️
    title: React (Browser)
    details: Error boundaries, useFlareLog hook, and page-view tracking for React apps.
    link: /guides/browser
    linkText: Learn more
  - icon: 📊
    title: OTel Integration
    details: W3C trace propagation, distributed tracing, and multi-backend fan-out (FlareLog + Grafana + Datadog).
    link: /otel-integration/overview
    linkText: Learn more
  - icon: 🧩
    title: Express
    details: Express middleware + error handler. Attaches req.logger with trace context.
    link: /getting-started/installation
    linkText: Learn more
  - icon: 📝
    title: Advanced Features
    details: Breadcrumbs, PII scrubbing, child loggers, sampling, beforeSend hooks, and custom spans.
    link: /guides/advanced
    linkText: Learn more
  - icon: 💎
    title: Lovable Platform
    details: Zero-config setup for Lovable-generated TanStack Start apps deployed to Cloudflare Workers.
    link: /platforms/lovable
    linkText: Learn more
---
