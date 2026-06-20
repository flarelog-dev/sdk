# Security Policy

## Reporting a Vulnerability

The FlareLog team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

### Where to report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues privately using **one** of the following channels, in order of preference:

1. **GitHub Security Advisories** (preferred): Go to <https://github.com/flarelog-dev/sdk/security/advisories/new> and submit a private vulnerability report.
2. **Email:** Send a PGP-encrypted email to <security@flarelog.dev>. (Public key fingerprint: see `SECURITY.md` history on the `main` branch — we will publish a key here in a future release.)

Please include the following in your report so we can triage quickly:

- A description of the issue and its potential impact
- A minimal proof of concept (code, reproduction steps, or a failing test)
- The affected versions of `@flarelog/sdk`, the runtime (Node.js version, Cloudflare Workers, browser), and the host framework (Express / Hono / Next.js / TanStack Start / React) where applicable
- Any mitigations you have already identified
- Your preferred disclosure timeline and whether you would like to be credited

### Response timelines

| Step                              | Target SLA      |
| --------------------------------- | --------------- |
| Acknowledge receipt of report     | Within 48 hours |
| Initial assessment / triage       | Within 5 business days |
| Fix or mitigation for high-severity issues | Within 14 days |
| Coordinated public disclosure     | Within 90 days, or sooner by mutual agreement |

If you do not receive a response within 48 hours, please follow up by emailing <security@flarelog.dev> again — it may have been caught by a spam filter.

## Scope

### In scope

The following components of the `flarelog-dev/sdk` repository are in scope:

- `src/` — all source code shipped in the published package
- `src/frameworks/` — framework adapter entry points (`express`, `hono`, `next`, `react`, `tanstack-start`, `cf-workers`)
- `src/client.ts`, `src/batch.ts` — the log ingestion pipeline and HTTP transport
- `src/dedup.ts`, `src/errors.ts`, `src/console.ts` — instrumentation hooks
- The `exports` map in `package.json` and the resulting published artifacts in `dist/`
- Default PII scrubbing behavior in `src/client.ts` (`scrubFields`, `beforeSend`)
- The default HTTPS enforcement for the ingestion endpoint

### Out of scope

The following are **not** managed by this repository and should be reported to their respective maintainers:

- The FlareLog hosted platform, web dashboard, and ingestion API at `flarelog.dev` — report via the in-app support channel or <security@flarelog.dev> with `Platform` in the subject.
- Vulnerabilities in upstream dependencies (e.g. `react`, `next`, `hono`, `express`). Report them to the upstream project directly; we will update our dependency ranges as fixes become available.
- Self-hosted FlareLog server deployments not using code from this repository.
- Issues that require privileged access to a reporter's own machine, network, or cloud account.

### What we do not consider a vulnerability

- Log injection from untrusted application data that is forwarded through `logger.log()` — that is the application's responsibility to sanitize before logging. The SDK's `scrubFields` and `beforeSend` hooks exist to support this, but they are opt-in redaction, not a security boundary.
- Sending logs over plain HTTP to a user-configured endpoint with `allowInsecure: true` explicitly set. The SDK refuses plain HTTP by default; opting out of that is the user's responsibility.
- Rate limiting or quota enforcement on the ingestion endpoint — that is platform-side behavior.

## Supported versions

We provide security fixes for the following versions of `@flarelog/sdk`:

| Version | Supported          | Notes                          |
| ------- | ------------------ | ------------------------------ |
| 1.x     | :white_check_mark: | Current stable line            |
| < 1.0   | :x:                | Pre-release; upgrade required  |

Only the latest minor release of the current major line receives active security patches. When a new minor is released, the previous minor enters a 30-day grace period during which critical fixes may be backported at our discretion.

## Security-relevant configuration

When deploying FlareLog, review the following configuration knobs. Misconfiguration of any of these can weaken the security posture of your application:

- **`apiKey`** — Required. Treat as a secret. Never commit to version control; load from your environment (`process.env.FLARELOG_API_KEY`, `wrangler.toml` secrets, Vercel project env vars, etc.).
- **`allowInsecure: true`** — Disables HTTPS enforcement on the ingestion endpoint. Only use for local development against `http://localhost`. Never enable in production.
- **`scrubFields`** — Default list redacts common credential-bearing keys (`password`, `secret`, `token`, `apiKey`, `authorization`, `cookie`, `session`, `credit_card`, `ssn`). **Emails, phone numbers, and free-form names are NOT scrubbed by default.** Extend the list or supply a custom `beforeSend` hook for stricter PII redaction.
- **`beforeSend`** — Synchronous hook invoked before each log is queued. Return `false` to drop the log entirely, or mutate the payload to remove sensitive data.

## Acknowledgments

We are grateful to the security researchers and community members who help keep FlareLog safe. Contributors to security fixes will be credited in the relevant GitHub Security Advisory and in the `CHANGELOG.md` entry for the fixed release, unless they prefer to remain anonymous.
