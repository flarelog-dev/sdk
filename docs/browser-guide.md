# FlareLog SDK - Browser Guide

## Quick Start (3 lines)

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_api_key", });

logger.info("Page loaded", { url: window.location.href });
```

The `flarelog()` factory auto-detects environment and enables console/globalErrors/rejections capture by default.

## Vanilla JavaScript

```html
<script type="module">
  import { flarelog } from "@flarelog/sdk";
  
  const logger = flarelog({
    apiKey: "fl_your_api_key",
    autoCapture: {
      console: true,
      globalErrors: true,
      rejections: true,
      http: true,        // Capture fetch/XHR as breadcrumbs
      navigation: true, // Capture page navigation
      clicks: true,      // Capture user clicks
    },
  });
  
  // Set user context if authenticated
  logger.setUser({
    id: "user_123",
    email: "user@example.com",
  });
  
  // Manual logging
  logger.info("Page loaded", { url: window.location.href });
</script>
```

## React

```typescript
// flarelog.ts
import { flarelog } from "@flarelog/sdk";

export const logger = flarelog({
  apiKey: process.env.REACT_APP_FLARELOG_API_KEY!,
  release: process.env.REACT_APP_VERSION,
  autoCapture: {
    console: true,
    globalErrors: true,
    rejections: true,
    http: true,
    navigation: true,
    clicks: true,
  },
  beforeSend: (log) => {
    if (log.metadata?.password) delete log.metadata.password;
    if (log.metadata?.token) log.metadata.token = "[REDACTED]";
    return log;
  },
});

// App.tsx
import { FlareLogErrorBoundary } from "@flarelog/sdk/react";

function App() {
  return (
    <FlareLogErrorBoundary logger={logger}>
      <Router>
        <Routes />
      </Router>
    </FlareLogErrorBoundary>
  );
}

// Component.tsx
import { useFlareLog } from "@flarelog/sdk/react";

function MyComponent() {
  const { trackEvent, trackError } = useFlareLog(logger);
  
  const handleClick = () => {
    trackEvent("button_clicked", { button: "checkout" });
  };
  
  return <button onClick={handleClick}>Click me</button>;
}
```

// hooks/useUserTracking.ts
import { useEffect } from "react";
import { logger } from "../flarelog";

export function useUserTracking(user: { id: string; email: string } | null) {
  useEffect(() => {
    if (user) {
      logger.setUser({
        id: user.id,
        email: user.email,
      });
    } else {
      logger.setUser(null);
    }
  }, [user]);
}

// App.tsx
import { useUserTracking } from "./hooks/useUserTracking";
import { useAuth } from "./hooks/useAuth";

function App() {
  const { user } = useAuth();
  useUserTracking(user);
  
  return (
    <div>
      {/* Your app */}
    </div>
  );
}
```

### React Error Boundary

```typescript
// components/ErrorBoundary.tsx
import React from "react";
import { logger } from "../flarelog";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.logError(error, {
      message: "React error boundary caught error",
      metadata: {
        componentStack: errorInfo.componentStack,
        reactVersion: React.version,
      },
    });
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h1>Something went wrong</h1>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}

// Usage in App.tsx
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary fallback={<ErrorPage />}>
      <Router>
        <Routes />
      </Router>
    </ErrorBoundary>
  );
}
```

### Vue 3

```typescript
// plugins/flarelog.ts
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: import.meta.env.VITE_FLARELOG_API_KEY,
  environment: import.meta.env.MODE,
  autoCapture: {
    console: true,
    globalErrors: true,
    rejections: true,
    http: true,
    navigation: true,
  },
});

export default {
  install(app) {
    app.config.globalProperties.$logger = logger;
    
    // Vue error handler
    app.config.errorHandler = (err, instance, info) => {
      logger.logError(err, {
        message: "Vue error",
        metadata: {
          component: instance?.$options?.name || "anonymous",
          info,
        },
      });
    };
    
    // Vue warning handler
    app.config.warnHandler = (msg, instance, trace) => {
      logger.warn(msg, {
        component: instance?.$options?.name,
        trace,
      });
    };
  },
};

// main.ts
import { createApp } from "vue";
import App from "./App.vue";
import flarelogPlugin from "./plugins/flarelog";

const app = createApp(App);
app.use(flarelogPlugin);
app.mount("#app");

// Usage in components
<script setup>
import { getCurrentInstance } from "vue";

const { proxy } = getCurrentInstance();

function handleClick() {
  proxy.$logger.info("Button clicked", { button: "submit" });
}
</script>
```

### Next.js

```typescript
// lib/flarelog.ts
import { FlareLog } from "@flarelog/sdk";

export const logger = new FlareLog({
  apiKey: process.env.NEXT_PUBLIC_FLARELOG_API_KEY!,
  environment: process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  serverName: typeof window === "undefined" ? "server" : "client",
  autoCapture: {
    console: true,
    globalErrors: true,
    rejections: true,
    http: true,
    navigation: true,
  },
  beforeSend: (log) => {
    // Scrub sensitive data
    if (log.metadata?.password) delete log.metadata.password;
    if (log.metadata?.creditCard) delete log.metadata.creditCard;
    return log;
  },
});

// pages/_app.tsx (Pages Router)
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { logger } from "../lib/flarelog";

export default function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Track page views
    logger.info("Page view", {
      path: window.location.pathname,
      referrer: document.referrer,
    });
  }, []);
  
  return <Component {...pageProps} />;
}

// app/layout.tsx (App Router)
import { FlareLogProvider } from "../components/FlareLogProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <FlareLogProvider>{children}</FlareLogProvider>
      </body>
    </html>
  );
}

// components/FlareLogProvider.tsx
"use client";

import { useEffect } from "react";
import { logger } from "../lib/flarelog";

export function FlareLogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    logger.info("Page mounted", {
      path: window.location.pathname,
    });
  }, []);
  
  return <>{children}</>;
}

// API Routes (pages/api/hello.ts)
import type { NextApiRequest, NextApiResponse } from "next";
import { logger } from "../../lib/flarelog";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const traceId = req.headers["x-trace-id"] as string || crypto.randomUUID();
  
  logger.setTag("api", "hello");
  logger.info("API request", {
    method: req.method,
    path: req.url,
    traceId,
  });
  
  try {
    const data = await fetchData();
    logger.info("API response", { traceId, status: 200 });
    res.status(200).json(data);
  } catch (err) {
    logger.logError(err, {
      message: "API error",
      metadata: { traceId, path: req.url },
    });
    res.status(500).json({ error: "Internal error" });
  }
}
```

### Svelte / SvelteKit

```typescript
// lib/flarelog.ts
import { FlareLog } from "@flarelog/sdk";

export const logger = new FlareLog({
  apiKey: import.meta.env.VITE_FLARELOG_API_KEY,
  environment: import.meta.env.MODE,
  autoCapture: {
    console: true,
    globalErrors: true,
    rejections: true,
  },
});

// hooks.client.ts (SvelteKit)
import { logger } from "$lib/flarelog";

export async function handleError({ error, event }) {
  logger.logError(error, {
    message: "SvelteKit client error",
    metadata: {
      url: event.url.pathname,
      route: event.route?.id,
    },
  });
}

// hooks.server.ts (SvelteKit)
import { logger } from "$lib/flarelog";

export async function handleError({ error, event }) {
  logger.logError(error, {
    message: "SvelteKit server error",
    metadata: {
      url: event.url.pathname,
      method: event.request.method,
    },
  });
}

// Usage in components
<script>
  import { logger } from "$lib/flarelog";
  
  function handleClick() {
    logger.info("Button clicked", { button: "primary" });
  }
</script>

<button on:click={handleClick}>Click me</button>
```

## Performance Tracking

```typescript
// Track Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from "web-vitals";
import { logger } from "./flarelog";

function sendToFlareLog(metric) {
  logger.info(`Web Vital: ${metric.name}`, {
    value: metric.value,
    rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
    delta: metric.delta,
    id: metric.id,
  });
}

getCLS(sendToFlareLog);
getFID(sendToFlareLog);
getFCP(sendToFlareLog);
getLCP(sendToFlareLog);
getTTFB(sendToFlareLog);
```

## User Tracking

```typescript
// Track user actions
function trackUserAction(action: string, data?: Record<string, unknown>) {
  logger.addBreadcrumb({
    category: "user",
    message: action,
    data,
  });
  
  logger.info(`User action: ${action}`, data);
}

// Track navigation
window.addEventListener("popstate", () => {
  logger.addBreadcrumb({
    category: "navigation",
    message: `Navigated to ${window.location.pathname}`,
  });
});

// Track form submissions
document.querySelectorAll("form").forEach(form => {
  form.addEventListener("submit", (e) => {
    logger.info("Form submitted", {
      formId: form.id,
      formAction: form.action,
    });
  });
});
```

## Redux / State Management

```typescript
// middleware/flarelogMiddleware.ts
import { logger } from "../flarelog";

export const flarelogMiddleware = (store) => (next) => (action) => {
  logger.addBreadcrumb({
    category: "redux",
    message: action.type,
    data: { payload: action.payload },
  });
  
  try {
    return next(action);
  } catch (err) {
    logger.logError(err, {
      message: "Redux error",
      metadata: {
        action: action.type,
        state: store.getState(),
      },
    });
    throw err;
  }
};

// store.ts
import { configureStore } from "@reduxjs/toolkit";
import { flarelogMiddleware } from "./middleware/flarelogMiddleware";

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(flarelogMiddleware),
});
```

## BeforeSend Examples

```typescript
// Scrub PII
const logger = new FlareLog({
  beforeSend: (log) => {
    // Remove sensitive fields
    const scrubbed = { ...log };
    
    if (scrubbed.metadata) {
      const sensitiveFields = [
        "password", "token", "secret", "creditCard", "ssn",
        "email", "phone", "address"
      ];
      
      sensitiveFields.forEach(field => {
        if (scrubbed.metadata[field]) {
          scrubbed.metadata[field] = "[REDACTED]";
        }
      });
    }
    
    return scrubbed;
  },
});

// Filter out health checks
const logger = new FlareLog({
  beforeSend: (log) => {
    if (log.message?.includes("/health")) {
      return false; // Drop health check logs
    }
    return log;
  },
});

// Add custom metadata
const logger = new FlareLog({
  beforeSend: (log) => ({
    ...log,
    metadata: {
      ...log.metadata,
      appVersion: "1.2.3",
      buildTime: BUILD_TIME,
    },
  }),
});
```

## Best Practices

1. **Initialize early**: Create logger before app mounts
2. **Use environment variables**: Don't hardcode API keys
3. **Enable autoCapture**: Capture console, errors, and rejections
4. **Set user context**: Identify users when they log in
5. **Add breadcrumbs**: Track user actions before errors
6. **Use beforeSend**: Scrub PII and filter noise
7. **Track releases**: Tag logs with version for regression tracking
8. **Flush on unload**: Ensure logs are sent before page closes

```typescript
// Ensure logs are sent before page unload
window.addEventListener("beforeunload", () => {
  logger.flush();
});
```
