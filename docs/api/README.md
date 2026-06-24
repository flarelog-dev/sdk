**@flarelog/sdk**

***

# @flarelog/sdk

## Classes

- [FlareLog](classes/FlareLog.md)
- [FlareLogChild](classes/FlareLogChild.md)
- [DedupTracker](classes/DedupTracker.md)
- [ConsoleTransport](classes/ConsoleTransport.md)
- [FlarelogTransport](classes/FlarelogTransport.md)
- [OTLPTransport](classes/OTLPTransport.md)

## Interfaces

- [Transport](interfaces/Transport.md)
- [TransportCapabilities](interfaces/TransportCapabilities.md)
- [LogEntry](interfaces/LogEntry.md)
- [UserContext](interfaces/UserContext.md)
- [Breadcrumb](interfaces/Breadcrumb.md)
- [FlareLogConfig](interfaces/FlareLogConfig.md)
- [AutoCaptureConfig](interfaces/AutoCaptureConfig.md)
- [ConsoleCaptureOptions](interfaces/ConsoleCaptureOptions.md)
- [IngestResult](interfaces/IngestResult.md)
- [CaptureOptions](interfaces/CaptureOptions.md)
- [FlareLogLike](interfaces/FlareLogLike.md)
- [ExecutionContextLike](interfaces/ExecutionContextLike.md)
- [RequestContext](interfaces/RequestContext.md)
- [QueuedLog](interfaces/QueuedLog.md)

## Type Aliases

- [VercelServerlessHandler](type-aliases/VercelServerlessHandler.md)
- [VercelEdgeHandler](type-aliases/VercelEdgeHandler.md)
- [LogLevel](type-aliases/LogLevel.md)
- [ConsoleLevel](type-aliases/ConsoleLevel.md)
- [TransportConfig](type-aliases/TransportConfig.md)
- [WorkerFetchHandler](type-aliases/WorkerFetchHandler.md)

## Functions

- [runWithHookSkipped](functions/runWithHookSkipped.md)
- [installConsoleHooks](functions/installConsoleHooks.md)
- [serializeError](functions/serializeError.md)
- [getRootCause](functions/getRootCause.md)
- [isErrorLike](functions/isErrorLike.md)
- [getErrorFingerprint](functions/getErrorFingerprint.md)
- [buildConsoleError](functions/buildConsoleError.md)
- [serializeConsoleArgs](functions/serializeConsoleArgs.md)
- [formatConsoleMessage](functions/formatConsoleMessage.md)
- [flarelog](functions/flarelog.md)
- [workerFetch](functions/workerFetch.md)
- [withVercelServerless](functions/withVercelServerless.md)
- [withVercelEdge](functions/withVercelEdge.md)
- [detectVercelEnv](functions/detectVercelEnv.md)
- [shouldLog](functions/shouldLog.md)
- [getLevelValue](functions/getLevelValue.md)
- [detectOtelEnv](functions/detectOtelEnv.md)
- [detectFlarelogEnv](functions/detectFlarelogEnv.md)
- [detectRuntime](functions/detectRuntime.md)
- [detectServiceName](functions/detectServiceName.md)
- [ensurePropagatorInstalled](functions/ensurePropagatorInstalled.md)
- [extractContext](functions/extractContext.md)
- [injectContext](functions/injectContext.md)
- [getActiveSpanContext](functions/getActiveSpanContext.md)
- [withActiveSpan](functions/withActiveSpan.md)
- [initProviders](functions/initProviders.md)
- [buildResource](functions/buildResource.md)
- [createWorkerFetchHandler](functions/createWorkerFetchHandler.md)
- [wrapWorker](functions/wrapWorker.md)
