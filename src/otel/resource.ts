import { defaultResource, resourceFromAttributes, type Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_SERVICE_NAMESPACE,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_VERSION,
} from "@opentelemetry/semantic-conventions";
// Experimental attrs (host.name, cloud.provider) live in the incubating entry point.
import {
  ATTR_HOST_NAME,
  ATTR_CLOUD_PROVIDER,
} from "@opentelemetry/semantic-conventions/incubating";
import { detectRuntime, detectServiceName } from "./env";

const SDK_VERSION = "2.0.0";

export interface ResourceConfig {
  serviceName?: string;
  serviceVersion?: string;
  serviceNamespace?: string;
  environment?: string;
  serverName?: string;
  /** Extra resource attributes (e.g. from OTEL_RESOURCE_ATTRIBUTES) */
  attributes?: Record<string, string>;
}

/**
 * Build the OTel Resource for this process.
 *
 * A Resource describes the entity producing telemetry (service name, version,
 * cloud provider, etc.). It's attached to every log record and span.
 */
export function buildResource(config: ResourceConfig = {}): Resource {
  const runtime = detectRuntime();
  const attrs: Record<string, string> = {
    [ATTR_TELEMETRY_SDK_NAME]: "flarelog",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "webjs",
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_VERSION,
  };

  // service.name
  attrs[ATTR_SERVICE_NAME] = config.serviceName ?? detectServiceName();

  // service.version
  if (config.serviceVersion) {
    attrs[ATTR_SERVICE_VERSION] = config.serviceVersion;
  }

  // service.namespace
  if (config.serviceNamespace) {
    attrs[ATTR_SERVICE_NAMESPACE] = config.serviceNamespace;
  }

  // deployment.environment.name
  if (config.environment) {
    attrs[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = config.environment;
  }

  // host.name
  if (config.serverName) {
    attrs[ATTR_HOST_NAME] = config.serverName;
  }

  // Cloud provider detection
  if (runtime === "cloudflare-workers") {
    attrs[ATTR_CLOUD_PROVIDER] = "cloudflare";
  }

  // Merge extra attributes from OTEL_RESOURCE_ATTRIBUTES
  if (config.attributes) {
    for (const [k, v] of Object.entries(config.attributes)) {
      attrs[k] = v;
    }
  }

  return defaultResource().merge(resourceFromAttributes(attrs));
}
