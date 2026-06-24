[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / AutoCaptureConfig

# Interface: AutoCaptureConfig

Defined in: [types.ts:175](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L175)

Automatic error capture configuration

## Properties

### console?

> `optional` **console?**: `boolean` \| [`ConsoleCaptureOptions`](ConsoleCaptureOptions.md)

Defined in: [types.ts:177](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L177)

Capture console.error / console.warn (and optionally more)

***

### globalErrors?

> `optional` **globalErrors?**: `boolean`

Defined in: [types.ts:179](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L179)

Capture global/runtime error events

***

### rejections?

> `optional` **rejections?**: `boolean`

Defined in: [types.ts:181](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L181)

Capture unhandled promise rejections

***

### fetchHandler?

> `optional` **fetchHandler?**: `boolean`

Defined in: [types.ts:183](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L183)

Enable worker fetch handler wrapper helpers. Not currently used.

***

### worker?

> `optional` **worker?**: `boolean`

Defined in: [types.ts:185](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L185)

Enable Web Worker wrapper helpers. Not currently used.

***

### dedupWindowMs?

> `optional` **dedupWindowMs?**: `number`

Defined in: [types.ts:187](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L187)

Deduplication window in milliseconds. Defaults to 5000

***

### navigation?

> `optional` **navigation?**: `boolean`

Defined in: [types.ts:189](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L189)

Capture navigation breadcrumbs. Not yet implemented.

***

### http?

> `optional` **http?**: `boolean`

Defined in: [types.ts:191](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L191)

Capture fetch/XHR breadcrumbs and performance data. Not yet implemented.

***

### clicks?

> `optional` **clicks?**: `boolean`

Defined in: [types.ts:193](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L193)

Capture DOM click breadcrumbs. Not yet implemented.
