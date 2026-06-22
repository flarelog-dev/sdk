import type { Resource } from "./types";
import { detectRuntime, detectServiceName } from "./env";

const SDK_VERSION = "2.0.0";

const ATTR_SERVICE_NAME = "service.name";
const ATTR_SERVICE_VERSION = "service.version";
const ATTR_SERVICE_NAMESPACE = "service.namespace";
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";
const ATTR_TELEMETRY_SDK_NAME = "telemetry.sdk.name";
const ATTR_TELEMETRY_SDK_LANGUAGE = "telemetry.sdk.language";
const ATTR_TELEMETRY_SDK_VERSION = "telemetry.sdk.version";
const ATTR_HOST_NAME = "host.name";
const ATTR_CLOUD_PROVIDER = "cloud.provider";

export interface ResourceConfig {
  serviceName?: string;
  serviceVersion?: string;
  serviceNamespace?: string;
  environment?: string;
  serverName?: string;
  attributes?: Record<string, string>;
}

function createResource(attributes: Record<string, unknown>): Resource {
  return {
    attributes,
    merge(other: Resource | null): Resource {
      if (!other) return this;
      return createResource({ ...this.attributes, ...other.attributes });
    },
  };
}

export function buildResource(config: ResourceConfig = {}): Resource {
  const runtime = detectRuntime();
  const attrs: Record<string, string> = {
    [ATTR_TELEMETRY_SDK_NAME]: "flarelog",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "webjs",
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_VERSION,
  };

  attrs[ATTR_SERVICE_NAME] = config.serviceName ?? detectServiceName();

  if (config.serviceVersion) {
    attrs[ATTR_SERVICE_VERSION] = config.serviceVersion;
  }

  if (config.serviceNamespace) {
    attrs[ATTR_SERVICE_NAMESPACE] = config.serviceNamespace;
  }

  if (config.environment) {
    attrs[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = config.environment;
  }

  if (config.serverName) {
    attrs[ATTR_HOST_NAME] = config.serverName;
  }

  if (runtime === "cloudflare-workers") {
    attrs[ATTR_CLOUD_PROVIDER] = "cloudflare";
  }

  if (config.attributes) {
    for (const [k, v] of Object.entries(config.attributes)) {
      attrs[k] = v;
    }
  }

  return createResource(attrs);
}
