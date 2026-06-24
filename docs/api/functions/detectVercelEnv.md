[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / detectVercelEnv

# Function: detectVercelEnv()

> **detectVercelEnv**(): \{ `isVercel`: `true`; `environment`: `string`; `region`: `string`; `url`: `string`; `commitSha`: `string`; `commitRef`: `string`; `projectId`: `string`; `deploymentId`: `string`; \} \| `null`

Defined in: [frameworks/vercel.ts:302](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/frameworks/vercel.ts#L302)

Detect Vercel-specific environment information.

Reads the standard `VERCEL_*` environment variables set automatically by
the Vercel platform and returns them as a structured object. Returns `null`
when not running on Vercel.

This is useful for enriching log metadata with deployment context:
- `VERCEL` — always `"1"` on Vercel
- `VERCEL_ENV` — `"production"` | `"preview"` | `"development"`
- `VERCEL_REGION` — deployment region (e.g. `"iad1"`)
- `VERCEL_URL` — auto-generated deployment URL
- `VERCEL_GIT_COMMIT_SHA` — git commit SHA
- `VERCEL_GIT_COMMIT_REF` — git branch name
- `VERCEL_PROJECT_ID` — Vercel project identifier
- `VERCEL_DEPLOYMENT_ID` — unique deployment identifier

## Returns

\{ `isVercel`: `true`; `environment`: `string`; `region`: `string`; `url`: `string`; `commitSha`: `string`; `commitRef`: `string`; `projectId`: `string`; `deploymentId`: `string`; \} \| `null`
