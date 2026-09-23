# Patch 13.6 — Security Verification & Cleanup

## Goal

Close the 13.x security phase by auditing the boundaries between the protections already added in 13.2–13.5.

This patch focuses on bypasses and drift rather than adding a new security product.

## Repository audit

The current AnimeBox API tree contains 104 route files.

All state-changing API routes were reviewed for one of these boundaries:

- authenticated/user-owned mutation path;
- `readBody()` / `readJsonBody()` browser boundary;
- explicit `assertBrowserMutationRequest()`;
- `requireAdminMutation()`;
- centralized cron authentication;
- Telegram webhook secret authentication;
- an explicit 410 no-op legacy endpoint.

A new build invariant scans the API tree and fails if a mutation route loses the expected boundary or reintroduces raw `request.json()`.

## Production Supabase audit

Production was inspected during this patch.

### RLS

- public tables checked: 63
- public tables with RLS disabled: 0

Tables intentionally accessible only from service-role/server code commonly have RLS enabled with zero browser policies.

### Storage

`profile-media`:

- public read is allowed;
- authenticated users may delete only objects in their own top-level folder.

`profile-media-quarantine`:

- remains private;
- no ordinary public read policy exists;
- publication still happens only after the server validation path.

### SECURITY DEFINER RPCs

All SECURITY DEFINER functions exposed to `authenticated` were reviewed.

No SECURITY DEFINER function in the audited public/internal schemas is executable by `anon`.

The authenticated functions are user-scoped through `auth.uid()` or otherwise explicitly constrained.

## Critical finding: protected profile columns

RLS previously guaranteed that a user could only update their own `profiles` row, but it did not protect individual columns.

That meant a signed-in client could attempt to bypass trusted server flows by directly changing:

- `telegram_id`;
- `avatar_path`;
- `banner_path`;
- legacy `avatar_url` / `banner_url`.

This mattered because Telegram linking must require signed Telegram data, and profile media must pass private quarantine + technical validation.

### Fix

Production now has `profiles_protect_server_managed_fields`.

For browser JWT roles, protected columns cannot be inserted or changed directly.

`created_at` is also protected from browser updates and is normalized to server time for browser-created rows.

Additional validated constraints guarantee that base avatar/banner paths:

- begin with the profile owner's UUID folder;
- are not HTTP/HTTPS URLs;
- contain no `..`;
- contain no backslash traversal.

The migration was applied to production and an authenticated-role simulation confirmed that direct `telegram_id` modification is rejected.

## Critical finding: direct comment RPC bypass

Both `create_episode_comment` and the older community `create_comment` RPC are intentionally callable by authenticated users because they are database mutation primitives behind the two current comment surfaces.

The HTTP APIs checked admin mute/ban state, but a caller could invoke these RPCs directly.

### Fix

Both RPCs now independently:

- requires `auth.uid()`;
- checks `admin_user_controls`;
- blocks active mute/ban restrictions;
- expires old restrictions safely;
- serializes writes per user with `pg_advisory_xact_lock`;
- applies the database anti-spam window after obtaining the lock;
- preserves request-id idempotency;
- remains unavailable to `anon`;
- grants execution only to `authenticated`.

Production verification confirmed the episode RPC restriction guard and serialization are present; the legacy community RPC was then hardened with the same boundary.

## Cron authentication cleanup

Six cron routes previously carried near-duplicate secret comparison code.

They now share:

`lib/server-request-auth.ts`

The helper:

- obtains `CRON_SECRET` only through the server-secret boundary;
- supports `x-cron-secret` and Bearer authorization;
- uses `timingSafeEqual`;
- fails closed when the secret is absent.

This reduces the chance that one cron route quietly drifts to weaker authentication later.

## Telegram webhook hardening

Telegram webhook authentication now uses the same timing-safe secret comparison primitive.

The webhook body is parsed only after secret verification and is bounded to 256 KiB.

Raw `request.json()` is no longer used on the webhook path.

## Mutation rate-limit gaps

Additional application limits were added around high-value or externally expensive actions:

- watch start/heartbeat/end writes;
- Premium Stars invoice creation;
- Premium recurring subscription actions;
- Support Stars invoice creation;
- Boosty claim submission;
- DonatePay claim creation;
- sponsor preference writes;
- notification settings/subscriptions;
- notification inbox writes;
- notification test messages.

The notification test limiter is deliberately much tighter because every accepted request can generate an external Telegram message.

## Profile media URL cleanup

Public profile/avatar resolvers no longer accept an HTTP/HTTPS string stored in a media-path field as a valid image URL.

Only AnimeBox Storage paths are resolved.

This prevents an accidental or legacy database value from turning public profiles into an external tracking-image surface.

## Build-time verification

`scripts/security-verification-check.mjs` now validates:

- mutation-route browser/server boundaries;
- no raw `request.json()` on mutation routes;
- admin mutation guards;
- centralized cron auth;
- timing-safe webhook auth;
- protected-profile migrations;
- hardened comment RPC migration;
- external profile-media URL rejection;
- critical rate-limit invariants.

It runs after the previous 13.x security checks in `npm run security:check`.

## Remaining deliberate follow-ups

These are not blockers for closing 13.x:

1. Cloudflare -> Vercel origin-secret activation is still postponed until the owner is at a desktop.
2. A strict CSP is intentionally deferred until the player/auth/provider origin inventory is complete.
3. AI avatar-content moderation is optional and intentionally not required for publication.
4. Remote Vercel build verification may remain unavailable while the account build-rate limit is active.

## Security layers after 13.6

```text
Internet
  -> Cloudflare / edge layer
  -> AnimeBox Edge Shield
  -> browser mutation boundary
  -> API abuse/rate limits
  -> authentication / ownership
  -> admin role hierarchy
  -> UGC quarantine / byte validation
  -> Supabase RLS + protected RPCs/columns
  -> audit / build security invariants
```

13.x is considered complete once the local `security:check` and Next.js build pass.
