[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / AutoCaptureConfig

# Interface: AutoCaptureConfig

Defined in: [types.ts:260](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L260)

Automatic error capture configuration

## Properties

### console?

> `optional` **console?**: `boolean` \| [`ConsoleCaptureOptions`](ConsoleCaptureOptions.md)

Defined in: [types.ts:262](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L262)

Capture console.error / console.warn (and optionally more)

***

### globalErrors?

> `optional` **globalErrors?**: `boolean`

Defined in: [types.ts:264](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L264)

Capture global/runtime error events

***

### rejections?

> `optional` **rejections?**: `boolean`

Defined in: [types.ts:266](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L266)

Capture unhandled promise rejections

***

### fetchHandler?

> `optional` **fetchHandler?**: `boolean`

Defined in: [types.ts:268](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L268)

Enable worker fetch handler wrapper helpers. Not currently used.

***

### worker?

> `optional` **worker?**: `boolean`

Defined in: [types.ts:270](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L270)

Enable Web Worker wrapper helpers. Not currently used.

***

### dedupWindowMs?

> `optional` **dedupWindowMs?**: `number`

Defined in: [types.ts:272](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L272)

Deduplication window in milliseconds. Defaults to 5000

***

### navigation?

> `optional` **navigation?**: `boolean`

Defined in: [types.ts:274](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L274)

Capture navigation breadcrumbs. Not yet implemented.

***

### http?

> `optional` **http?**: `boolean`

Defined in: [types.ts:276](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L276)

Capture fetch/XHR breadcrumbs and performance data. Not yet implemented.

***

### clicks?

> `optional` **clicks?**: `boolean`

Defined in: [types.ts:278](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L278)

Capture DOM click breadcrumbs. Not yet implemented.
