import React from "react";
import type { FlareLog } from "../client";

interface ErrorBoundaryProps {
  logger: FlareLog;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * React Error Boundary that automatically logs errors to FlareLog.
 * 
 * @example
 * ```tsx
 * import { flarelog } from "@flarelog/sdk";
 * import { FlareLogErrorBoundary } from "@flarelog/sdk/react";
 * 
 * const logger = flarelog({ apiKey, project: "web" });
 * 
 * <FlareLogErrorBoundary logger={logger} fallback={<ErrorPage />}>
 *   <App />
 * </FlareLogErrorBoundary>
 * ```
 */
export class FlareLogErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.logger.logError(error, {
      message: "React error boundary caught error",
      metadata: {
        componentStack: errorInfo.componentStack,
        reactVersion: React.version,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div style={{ padding: 20 }}>
            <h1>Something went wrong</h1>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

/**
 * React hook for tracking events and errors with FlareLog.
 * 
 * @example
 * ```tsx
 * import { useFlareLog } from "@flarelog/sdk/react";
 * 
 * function MyComponent() {
 *   const { trackEvent, trackError } = useFlareLog(logger);
 *   
 *   const handleClick = () => {
 *     trackEvent("button_clicked", { button: "checkout" });
 *   };
 *   
 *   return <button onClick={handleClick}>Click</button>;
 * }
 * ```
 */
export function useFlareLog(logger: FlareLog) {
  const trackEvent = React.useCallback(
    (event: string, data?: Record<string, unknown>) => {
      logger.info(event, data);
    },
    [logger]
  );

  const trackError = React.useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      logger.logError(error, { metadata: context });
    },
    [logger]
  );

  const setUser = React.useCallback(
    (user: { id: string; email?: string; name?: string } | null) => {
      logger.setUser(user);
    },
    [logger]
  );

  const addBreadcrumb = React.useCallback(
    (breadcrumb: { category: string; message: string; data?: Record<string, unknown> }) => {
      logger.addBreadcrumb(breadcrumb);
    },
    [logger]
  );

  return { trackEvent, trackError, setUser, addBreadcrumb };
}

/**
 * React hook for tracking page views.
 * 
 * @example
 * ```tsx
 * import { useFlareLogPageView } from "@flarelog/sdk/react";
 * 
 * function HomePage() {
 *   useFlareLogPageView(logger, "Home");
 *   return <div>Home</div>;
 * }
 * ```
 */
export function useFlareLogPageView(logger: FlareLog, pageName?: string) {
  React.useEffect(() => {
    logger.info(pageName || "Page view", {
      path: window.location.pathname,
      referrer: document.referrer,
    });
  }, [logger, pageName]);
}
