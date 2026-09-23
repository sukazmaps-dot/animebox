# Patch 13.5 — Browser & Session Hardening

## Goal

Harden AnimeBox against browser-driven request abuse, unsafe auth redirects and session-flow mistakes without changing the existing Supabase authentication architecture.

This patch is defense-in-depth. Edge Shield remains the first browser cross-site boundary, while sensitive application routes now validate browser request properties again inside the app.

## Browser mutation boundary

`lib/community-server.ts` now provides:

- `assertBrowserMutationRequest(request)`
- `readJsonBody(request, options)`
- backward-compatible `readBody(request)`

Sensitive mutation requests reject:

- a foreign `Origin`;
- `Sec-Fetch-Site: cross-site`;
- navigation/form-style API requests with `Sec-Fetch-Mode: navigate`.

Sensitive JSON endpoints additionally require an application JSON content type and enforce the body limit using actual UTF-8 bytes instead of JavaScript string length.

The older `readBody()` wrapper keeps legacy content-type compatibility so existing endpoints are not broken by the rollout, while still gaining the browser mutation and byte-size checks.

## Sensitive JSON routes

The stricter JSON boundary is now used for browser-facing authentication/session/payment/notification operations including:

- Telegram web login;
- Telegram Mini App register/session/validation/link/subscription check;
- support Stars invoice creation;
- Premium Stars invoice creation;
- Premium recurring subscription actions;
- notification settings/subscriptions;
- client analytics batches.

Telegram webhooks and cron routes remain server-to-server flows and are not forced through browser-origin checks.

## No-body mutations

State-changing routes that do not consume JSON now call `assertBrowserMutationRequest()` directly, including:

- Telegram nonce creation;
- notification test send;
- Boosty Premium recheck;
- Premium media reset;
- Watch Together room end.

## Redirect safety

All major auth return-path consumers now use one shared `safeInternalPath()` implementation.

It rejects:

- external absolute URLs;
- protocol-relative URLs;
- malformed/backslash-based URL tricks;
- control characters;
- excessively long redirect targets.

The sanitizer is used by:

- OAuth callback;
- login;
- registration;
- onboarding;
- Google login button;
- Telegram login button.

This removes duplicated ad-hoc `startsWith('/')` checks.

## Telegram nonce cookie

The Telegram web-login nonce cookie is now:

- HttpOnly;
- Secure in production;
- SameSite=Strict;
- scoped to `/api/auth/telegram`;
- limited to five minutes.

After successful nonce verification the cookie is explicitly expired with the same path. This avoids relying on a path-less cookie deletion that may fail to invalidate a path-scoped nonce.

## Browser headers and auth caching

Global headers now include:

- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- `X-Permitted-Cross-Domain-Policies: none`

`same-origin-allow-popups` keeps OAuth popup flows functional while providing a stronger browsing-context boundary than having no COOP policy.

`/auth/:path*` pages are explicitly included in the HTML no-store policy so password-recovery/account-access pages are not CDN cached.

## Build invariant

`scripts/browser-session-check.mjs` is part of `npm run security:check`.

It fails the build if critical browser/session protections are removed from the shared helpers or sensitive routes.

## Out of scope

This patch intentionally does not introduce a strict Content-Security-Policy yet. AnimeBox currently embeds multiple external player/provider origins, Telegram/Google auth resources and Supabase assets. A CSP should be deployed separately after an allowlist inventory so player/auth functionality is not broken.
