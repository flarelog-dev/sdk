# Supabase

Send your Supabase project's logs to FlareLog with a [log drain](https://supabase.com/docs/guides/observability/log-drains), with no SDK and no code change. Database errors, Edge Function output and failed requests arrive as FlareLog issues.

> Supabase offers log drains on the Pro plan and above, and bills each drain separately. See [Supabase's drain pricing](https://supabase.com/docs/guides/platform/manage-your-usage/log-drains).

## One click {#one-click}

1. In your FlareLog project, open **Settings → Connect → Supabase**.
2. Select **Connect Supabase**, choose your organization on Supabase's consent screen and approve access.
3. Pick your Supabase projects.

FlareLog creates an API key and adds a log drain named `FlareLog` to each project. You'll see it under **Project Settings → Log Drains** in Supabase. FlareLog revokes its Supabase access when it's done. Connecting again updates the existing drain instead of adding another.

## By hand {#manual}

1. In Supabase, open **Project Settings → Log Drains** and add a **Custom Endpoint** drain.
2. Use this URL, with **Gzip** on:

   ```
   https://flarelog.dev/api/v1/drains/supabase
   ```

3. Add these headers:
   - `Authorization`: `Bearer <your FlareLog API key>`. Create an ingest key in your project's **Settings → API keys**.
   - `X-Supabase-Project` (optional): a name for the project. FlareLog shows it as the source of the logs.

## What FlareLog keeps

| Service | Kept | Skipped |
| --- | --- | --- |
| Postgres | `ERROR`, `FATAL` and `PANIC` as errors, `WARNING` as warnings | `LOG`, `INFO`, `NOTICE` and `DEBUG` (checkpoints, connections, cron runs) |
| Edge Functions | Console output and uncaught exceptions, with the stack | Boot and shutdown events |
| API gateway and Edge Function requests | Requests that returned 5xx, as `METHOD /path returned 503` | Successful requests |
| Auth | Warnings and errors | Routine requests |
| PostgREST, connection pooler, Storage, Realtime | Lines that report an error | Everything else |

Skipped logs don't count toward your plan. FlareLog doesn't store the visitor IP addresses, locations, request headers, user agents, JWT details or email addresses that Supabase includes.

## Stopping

Remove the `FlareLog` drain under **Project Settings → Log Drains** in Supabase. Supabase stops sending logs and stops billing the drain.

## Using the SDK too

The drain covers what Supabase runs. For errors in your frontend or your own server, and for AI call tracking, add the FlareLog SDK to your app as well. See [Lovable](/platforms/lovable) for apps built there.
