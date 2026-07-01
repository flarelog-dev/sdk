[**@flarelog/sdk**](../index.md)

***

[@flarelog/sdk](../index.md) / FlareLogChild

# Class: FlareLogChild

Defined in: [client.ts:772](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L772)

`FlareLogChild` is a lightweight wrapper around the parent `FlareLog` logger that automatically merges a set of default metadata/tags into all logs emitted through it.

## When to use Child Loggers

Child loggers are ideal for request-scoped logging, structured operation tracing, or component-level logging:
- **Request Tracing**: Capture the incoming HTTP request context (`traceId`, `method`, `path`, client `ip`) and attach it to every log emitted during that request.
- **Sub-operations**: Scope logs within a complex workflow (e.g. `operation: "process-payment"`) to make filtering in the dashboard easier.
- **Context Inheritance**: Child loggers inherit global user contexts, tags, and transports from the parent logger.

## Usage Example

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_key" });

// Create a request-scoped child logger
const reqLogger = logger.child({
  traceId: "uuid-1234-5678",
  source: "http-handler",
  userId: "usr_99",
});

// Emitting logs via the child logger automatically attaches the defaults
reqLogger.info("Fetching database records");
// Output metadata: { traceId: "uuid-1234-5678", userId: "usr_99", source: "http-handler" }

// You can create nested child loggers
const dbLogger = reqLogger.child({
  source: "database", // overrides parent source
  query: "SELECT * FROM users",
});

dbLogger.info("Executing query");
// Output metadata: { traceId: "uuid-1234-5678", userId: "usr_99", source: "database", query: "SELECT..." }
```

## Flushes and Lifecycle

Calling `.flush()` on a child logger directly delegates to the parent logger's flush mechanism. You do not need to manage the batch processor or configuration separately for children; they share the same underlying OpenTelemetry provider and transports.


## Implements

- [`FlareLogLike`](../api/interfaces/FlareLogLike.md)

## Constructors

### Constructor

> **new FlareLogChild**(`parent`, `defaults`): `FlareLogChild`

Defined in: [client.ts:776](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L776)

#### Parameters

##### parent

[`FlareLog`](flarelog-class.md)

##### defaults

`Record`<`string`, `unknown`> & `object`

#### Returns

`FlareLogChild`

## Methods

### trace()

> **trace**(`message`, `metadata?`): `void`

Defined in: [client.ts:784](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L784)

#### Parameters

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`trace`](../api/interfaces/FlareLogLike.md#trace)

***

### debug()

> **debug**(`message`, `metadata?`): `void`

Defined in: [client.ts:785](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L785)

#### Parameters

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`debug`](../api/interfaces/FlareLogLike.md#debug)

***

### info()

> **info**(`message`, `metadata?`): `void`

Defined in: [client.ts:786](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L786)

#### Parameters

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`info`](../api/interfaces/FlareLogLike.md#info)

***

### warn()

> **warn**(`message`, `metadata?`): `void`

Defined in: [client.ts:787](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L787)

#### Parameters

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`warn`](../api/interfaces/FlareLogLike.md#warn)

***

### error()

> **error**(`message`, `metadata?`): `void`

Defined in: [client.ts:788](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L788)

#### Parameters

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`error`](../api/interfaces/FlareLogLike.md#error)

***

### fatal()

> **fatal**(`message`, `metadata?`): `void`

Defined in: [client.ts:789](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L789)

#### Parameters

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`fatal`](../api/interfaces/FlareLogLike.md#fatal)

***

### log()

> **log**(`level`, `message`, `metadata?`, `opts?`): `void`

Defined in: [client.ts:791](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L791)

#### Parameters

##### level

[`LogLevel`](../api/type-aliases/LogLevel.md)

##### message

`string`

##### metadata?

`Record`<`string`, `unknown`>

##### opts?

###### source?

`string`

###### traceId?

`string`

###### spanId?

`string`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`log`](../api/interfaces/FlareLogLike.md#log)

***

### logError()

> **logError**(`err`, `opts?`): `void`

Defined in: [client.ts:795](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L795)

#### Parameters

##### err

`unknown`

##### opts?

###### message?

`string`

###### level?

[`LogLevel`](../api/type-aliases/LogLevel.md)

###### source?

`string`

###### metadata?

`Record`<`string`, `unknown`>

###### traceId?

`string`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`logError`](../api/interfaces/FlareLogLike.md#logerror)

***

### addBreadcrumb()

> **addBreadcrumb**(`breadcrumb`): `void`

Defined in: [client.ts:799](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L799)

#### Parameters

##### breadcrumb

`Omit`<[`Breadcrumb`](../api/interfaces/Breadcrumb.md), `"timestamp"`>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`addBreadcrumb`](../api/interfaces/FlareLogLike.md#addbreadcrumb)

***

### setUser()

> **setUser**(`user`): `void`

Defined in: [client.ts:800](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L800)

#### Parameters

##### user

[`UserContext`](../api/interfaces/UserContext.md) \| `null`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`setUser`](../api/interfaces/FlareLogLike.md#setuser)

***

### setTag()

> **setTag**(`key`, `value`): `void`

Defined in: [client.ts:801](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L801)

#### Parameters

##### key

`string`

##### value

`string`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`setTag`](../api/interfaces/FlareLogLike.md#settag)

***

### flush()

> **flush**(): `Promise`<`void`>

Defined in: [client.ts:802](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L802)

#### Returns

`Promise`<`void`>

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`flush`](../api/interfaces/FlareLogLike.md#flush)

***

### child()

> **child**(`defaults`): `FlareLogChild`

Defined in: [client.ts:803](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L803)

#### Parameters

##### defaults

`Record`<`string`, `unknown`> & `object`

#### Returns

`FlareLogChild`

#### Implementation of

[`FlareLogLike`](../api/interfaces/FlareLogLike.md).[`child`](../api/interfaces/FlareLogLike.md#child)
