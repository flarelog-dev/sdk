import type { HrTime, ReadableLogRecord, ReadableSpan, Resource, InstrumentationScope } from "./types";

function hrTimeToNanos(hrTime: HrTime): string {
  const [seconds, nanos] = hrTime;
  return (BigInt(seconds) * 1_000_000_000n + BigInt(nanos)).toString();
}

type AnyValue =
  | { stringValue: string }
  | { intValue: number }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: AnyValue[] } }
  | { kvlistValue: { values: Array<{ key: string; value: AnyValue }> } }
  | {};

function toAnyValue(value: unknown): AnyValue {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { boolValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toAnyValue) } };
  }
  if (typeof value === "object") {
    const values: Array<{ key: string; value: AnyValue }> = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      values.push({ key: k, value: toAnyValue(v) });
    }
    return { kvlistValue: { values } };
  }
  return { stringValue: String(value) };
}

function toAttributes(attrs: Record<string, unknown>): Array<{ key: string; value: AnyValue }> {
  return Object.keys(attrs).map((key) => ({ key, value: toAnyValue(attrs[key]) }));
}

function createResource(resource: Resource): { attributes: Array<{ key: string; value: AnyValue }>; droppedAttributesCount: number } {
  return {
    attributes: toAttributes(resource.attributes),
    droppedAttributesCount: 0,
  };
}

function createInstrumentationScope(scope: InstrumentationScope): { name: string; version?: string } {
  const out: { name: string; version?: string } = { name: scope.name };
  if (scope.version !== undefined) out.version = scope.version;
  return out;
}

export function createExportLogsServiceRequest(logs: ReadableLogRecord[]): Record<string, unknown> {
  const resourceMap = new Map<Resource, Map<InstrumentationScope, ReadableLogRecord[]>>();
  for (const log of logs) {
    let scopeMap = resourceMap.get(log.resource);
    if (!scopeMap) {
      scopeMap = new Map();
      resourceMap.set(log.resource, scopeMap);
    }
    let records = scopeMap.get(log.instrumentationScope);
    if (!records) {
      records = [];
      scopeMap.set(log.instrumentationScope, records);
    }
    records.push(log);
  }

  const resourceLogs: unknown[] = [];
  for (const [resource, scopeMap] of resourceMap) {
    const scopeLogs: unknown[] = [];
    for (const [scope, records] of scopeMap) {
      const logRecords = records.map((log) => {
        const rec: Record<string, unknown> = {
          timeUnixNano: hrTimeToNanos(log.hrTime),
          observedTimeUnixNano: hrTimeToNanos(log.hrTimeObserved),
          severityNumber: log.severityNumber,
          severityText: log.severityText,
          body: toAnyValue(log.body),
          eventName: log.eventName,
          attributes: toAttributes(log.attributes),
          droppedAttributesCount: log.droppedAttributesCount ?? 0,
        };
        if (log.spanContext) {
          rec.flags = log.spanContext.traceFlags;
          rec.traceId = log.spanContext.traceId;
          rec.spanId = log.spanContext.spanId;
        }
        return rec;
      });
      scopeLogs.push({
        scope: createInstrumentationScope(scope),
        logRecords,
        schemaUrl: scope.schemaUrl,
      });
    }
    resourceLogs.push({
      resource: createResource(resource),
      scopeLogs,
      schemaUrl: resource.attributes["schemaUrl"] as string | undefined,
    });
  }

  return { resourceLogs };
}

export function createExportTraceServiceRequest(spans: ReadableSpan[]): Record<string, unknown> {
  const resourceMap = new Map<Resource, Map<InstrumentationScope, ReadableSpan[]>>();
  for (const span of spans) {
    let scopeMap = resourceMap.get(span.resource);
    if (!scopeMap) {
      scopeMap = new Map();
      resourceMap.set(span.resource, scopeMap);
    }
    let records = scopeMap.get(span.instrumentationScope);
    if (!records) {
      records = [];
      scopeMap.set(span.instrumentationScope, records);
    }
    records.push(span);
  }

  const resourceSpans: unknown[] = [];
  for (const [resource, scopeMap] of resourceMap) {
    const scopeSpans: unknown[] = [];
    for (const [scope, records] of scopeMap) {
      const otlpSpans = records.map((span) => {
        const events = span.events.map((e) => ({
          name: e.name,
          timeUnixNano: hrTimeToNanos(e.time),
          attributes: e.attributes ? toAttributes(e.attributes) : [],
          droppedAttributesCount: e.droppedAttributesCount ?? 0,
        }));
        const links = span.links.map((l) => ({
          spanId: l.context.spanId,
          traceId: l.context.traceId,
          traceState: l.context.traceState,
          attributes: l.attributes ? toAttributes(l.attributes) : [],
          droppedAttributesCount: 0,
          flags: (l.context.traceFlags & 0xff) | 0x100 | (l.context.isRemote ? 0x200 : 0),
        }));
        const flags = (span.spanContext.traceFlags & 0xff) | 0x100 | (span.spanContext.isRemote ? 0x200 : 0);
        return {
          traceId: span.spanContext.traceId,
          spanId: span.spanContext.spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          traceState: span.spanContext.traceState,
          name: span.name,
          kind: span.kind == null ? 0 : span.kind + 1,
          startTimeUnixNano: hrTimeToNanos(span.startTime),
          endTimeUnixNano: hrTimeToNanos(span.endTime),
          attributes: toAttributes(span.attributes),
          droppedAttributesCount: span.droppedAttributesCount,
          events,
          droppedEventsCount: span.droppedEventsCount,
          status: { code: span.status.code, message: span.status.message },
          links,
          droppedLinksCount: span.droppedLinksCount,
          flags,
        };
      });
      scopeSpans.push({
        scope: createInstrumentationScope(scope),
        spans: otlpSpans,
        schemaUrl: scope.schemaUrl,
      });
    }
    resourceSpans.push({
      resource: createResource(resource),
      scopeSpans,
      schemaUrl: resource.attributes["schemaUrl"] as string | undefined,
    });
  }

  return { resourceSpans };
}
