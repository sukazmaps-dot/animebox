# Patch 18.6.5 — Clickjacking & Browser Boundary Hardening

## Mission

Close the concrete browser-layer issue discovered during external feedback:
AnimeBox pages must not be renderable inside an attacker-controlled iframe.

This patch intentionally does not try to hide DevTools, public API requests,
response headers, or public leaderboard data. Those are visible by design and
are not authorization boundaries.

## Threat model

A clickjacking attack requires an attacker-controlled origin to embed AnimeBox,
make the frame transparent or visually misleading, and induce a signed-in user
to interact with AnimeBox controls.

The correct primary defense is browser-enforced anti-framing response headers,
not JavaScript frame-busting.

## Policy decision

AnimeBox currently has no legitimate page-framing use case.

Therefore the policy is:

```http
Content-Security-Policy: frame-ancestors 'none';
X-Frame-Options: DENY
```

`DENY` is deliberately stronger than `SAMEORIGIN`.

### Why this does not break the player

`frame-ancestors` controls who may embed an AnimeBox document. It does not
control which external frames AnimeBox may embed.

Kodik/provider iframe players remain outbound child frames and are unaffected.

### Why this does not break Telegram Mini App

Telegram Mini App runs the site in a WebView. It is not a parent HTML iframe
using frame embedding semantics, so `frame-ancestors 'none'` does not block
the Mini App.

## Implementation

### Global document boundary

`next.config.ts` adds the anti-framing headers to the existing
`securityHeaders` array that is applied to `/:path*`.

The CSP is intentionally limited to `frame-ancestors`. A full CSP
(`script-src`, `connect-src`, `frame-src`, etc.) remains a separate task
because it requires a complete inventory of Supabase, Telegram, analytics and
player-provider origins.

### Existing mutation boundary retained

`proxy.ts` already rejects browser cross-site unsafe API mutations by:
- validating `Origin`;
- rejecting `Sec-Fetch-Site: cross-site`;
- blocking TRACE/TRACK/CONNECT;
- enforcing the canonical production origin.

Patch 18.6.5 adds regression coverage for those invariants instead of
duplicating their runtime logic.

### Gateway compatibility

The RU Nginx proxy example is checked to ensure it does not hide CSP or
X-Frame-Options response headers.

### Same-origin iframe compatibility guard

The build check scans app/components source for obvious static same-origin
iframe usage. Because the policy is `DENY`, a future internal iframe should
cause a build failure and force an explicit architecture decision rather than a
silent production regression.

## Verification

Static:
- `npm run patch18-6-5:check`
- `npm run security:check`
- TypeScript
- targeted ESLint
- all existing prebuild gates
- Next production build

Deployed:
- `ANIMEBOX_SMOKE_ORIGIN=https://<origin> npm run security:clickjacking:smoke`
- check `/`, `/search`, `/leaderboard`, `/premium`, `/settings`
- verify CSP contains `frame-ancestors 'none'`
- verify X-Frame-Options equals `DENY`

Manual cross-origin browser probe:
1. serve a tiny HTML page from another origin;
2. add `<iframe src="https://youranimebox.com/settings"></iframe>`;
3. browser must refuse to render the AnimeBox document in the frame.

## Acceptance criteria

1. AnimeBox cannot be embedded by a foreign origin.
2. AnimeBox cannot be embedded even by its own origin unless this policy is
   deliberately changed in a future reviewed patch.
3. External player iframes continue to work.
4. Telegram Mini App remains unaffected.
5. Existing Origin/Sec-Fetch-Site mutation protection remains intact.
6. RU gateway does not strip anti-framing headers.
7. Build fails if anti-framing headers disappear or obvious same-origin iframe
   usage is introduced.
8. No SQL migration is required.
