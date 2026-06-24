---
layout: home

hero:
  name: FlareLog SDK
  text: Zero-dependency observability
  tagline: Ship logs, errors, and W3C traces from Cloudflare Workers, Vercel, Node.js, or the browser to FlareLog or any OTLP backend.
  actions:
    - theme: brand
      text: Get Started
      link: /quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/flarelog-dev/sdk

features:
  - icon: <span class="vp-icon">01</span>
    title: Zero Dependencies
    details: No external dependencies. Lightweight and fast for any JavaScript runtime.
  - icon: <span class="vp-icon">02</span>
    title: Cloudflare Workers
    details: Full OTel spans, workerFetch wrapper, Durable Objects, Queues, and Cron support.
    link: /platforms/cloudflare-workers
    linkText: Learn more
  - icon: <span class="vp-icon">03</span>
    title: Vercel
    details: Serverless Functions, Edge Functions, and Middleware with auto environment detection.
    link: /platforms/vercel
    linkText: Learn more
  - icon: <span class="vp-icon">04</span>
    title: Next.js
    details: Drop-in wrappers for Pages Router, App Router, and Edge Middleware.
    link: /frameworks/next
    linkText: Learn more
  - icon: <span class="vp-icon">05</span>
    title: Browser & React
    details: Error boundaries, hooks, and auto-capture for React, Vue, and vanilla JS.
    link: /guides/browser-guide
    linkText: Learn more
  - icon: <span class="vp-icon">06</span>
    title: Advanced Features
    details: Breadcrumbs, PII scrubbing, child loggers, sampling, and beforeSend hooks.
    link: /guides/advanced-features
    linkText: Learn more
---
