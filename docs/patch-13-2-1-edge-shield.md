# Patch 13.2.1 — Edge Shield

## Goal

Add a cheap request-rejection layer before expensive AnimeBox route logic and prepare the production origin for Cloudflare-only access.

## What the patch enforces

1. Production requests to non-canonical hosts are rejected for API/write traffic and redirected to `https://youranimebox.com` for normal GET/HEAD pages.
2. Vercel Cron paths stay exempt from the host lock because Vercel may invoke them by deployment hostname.
3. Unsafe browser API requests with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected before route handlers execute.
4. TRACE, TRACK and CONNECT are rejected.
5. API URLs longer than 4096 characters and declared request bodies larger than 512 KiB are rejected early.
6. Every request receives an `X-AnimeBox-Request-Id` for incident/debug correlation.
7. API responses receive `X-Robots-Tag: noindex, nofollow, noarchive`.
8. Global passive security headers add HSTS, MIME sniffing protection, a conservative referrer policy and a minimal permissions policy.
9. Build-time static checks prevent accidental removal of the shield.

## Cloudflare origin authentication

The code supports a stronger second stage that prevents attackers from bypassing Cloudflare by connecting to Vercel while sending `Host: youranimebox.com`.

Activation requires two matching settings outside the repository:

- Vercel production environment variable: `ANIMEBOX_EDGE_ORIGIN_SECRET=<long random secret>`
- Cloudflare request-header transform/origin rule that overwrites:
  `x-animebox-edge-verify: <same secret>`

Do not put that secret in GitHub or any `NEXT_PUBLIC_*` variable.

Until the environment variable is configured, this optional check stays disabled so deployment cannot lock out production accidentally.

## Cloudflare/WAF follow-up

Provider-side WAF/Bot Management should be configured to challenge or throttle abnormal traffic before it reaches Vercel. The application-level limiter from Patch 13.2 remains the second layer behind the edge shield.

Recommended high-risk paths for provider-side rules:

- `/api/auth/telegram*`
- `/api/telegram/register`
- `/api/profile/media/upload-url`
- `/api/comments`
- `/api/chat/*`
- `/api/players/kodik`
- `/api/anilibria`
- `/api/alloha`
- `/api/image`

## Acceptance criteria

- Production `*.vercel.app` API access does not execute AnimeBox business logic.
- Preview deployments continue to work.
- Vercel Cron continues to work.
- Telegram server webhooks without browser Origin headers remain valid.
- Normal same-origin browser writes continue to work.
- Cross-site browser writes fail with 403.
- Oversized declared API requests fail with 413.
- Existing API rate limits from Patch 13.2 remain unchanged.
- Telegram Mini App embedding is not blocked; the patch intentionally does not add `X-Frame-Options` or a restrictive `frame-ancestors` policy.
