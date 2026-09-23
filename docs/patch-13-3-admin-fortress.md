# Patch 13.3 — Admin Fortress v1

## Goal

Make AnimeBox administration fail-closed, role-aware, auditable and resistant to accidental or automated abuse.

## Threat model

This patch focuses on application-level admin risks:

- a normal user calling `/api/admin/*` directly;
- a compromised or buggy admin session flooding privileged endpoints;
- a moderator trying to act on an administrator or owner;
- an administrator trying to act on an equal/higher privileged account;
- accidental repeated state-changing requests;
- sensitive account data being unnecessarily exposed to moderators;
- a future admin API route being added without a server-side permission guard.

It does not replace account security, MFA, Cloudflare/Vercel edge controls or Supabase service-role secrecy.

## Server-side role model

Roles remain server-owned and are resolved from private environment variables:

- `owner`
- `admin`
- `moderator`

The browser cannot grant itself a role and the database does not contain a client-writable admin-role field.

`MONETIZATION_ADMIN_IDS` is retained only as a legacy owner fallback to avoid locking the existing production owner out. New configuration should use `ADMIN_OWNER_IDS`.

## Request protection

Every authenticated admin request passes the shared Supabase-backed limiter:

- 300 admin guard checks / minute / admin account.

Every state-changing admin endpoint also passes a stricter dual limiter:

- 60 mutations / minute / IP;
- 30 mutations / minute / admin account.

The limiter is fail-closed. If the shared rate-limit infrastructure is unavailable, privileged mutations return 503 rather than silently bypassing protection.

## Role hierarchy

The centralized `assertCanModerateTarget()` rule prevents a lower/equal role from moderating a privileged target.

Examples:

- moderator -> normal user: allowed;
- moderator -> admin: denied;
- moderator -> owner: denied;
- admin -> moderator: allowed;
- admin -> another admin: denied;
- admin -> owner: denied;
- owner -> admin/moderator: allowed;
- owner -> another owner: denied.

This protection is now used by user restrictions, community moderation, comment moderation and profile-media moderation.

## Privacy minimization

The admin users endpoint no longer exposes email or Telegram ID to moderators. Those fields remain available only to owner/admin roles.

For moderators the server returns:

- `email: null`
- `telegram_id: null`

The Auth user list is not fetched at all for moderator requests.

## Audit correlation

`writeAdminAudit()` can attach the Edge Shield `x-animebox-request-id` to audit details. Updated high-risk routes begin passing the originating request so incidents can be correlated with request logs.

## Build-time invariant

`scripts/admin-fortress-check.mjs` runs during `npm run security:check`.

It fails the build if:

1. an `app/api/admin/**/route.ts` file has no server-side admin boundary;
2. a POST/PATCH/PUT/DELETE admin route does not use `requireAdminMutation()`;
3. the centralized role hierarchy or limiter disappears;
4. moderator sensitive-field redaction disappears.

This turns the admin boundary into a repository invariant instead of relying on developer memory.

## Database verification

Production Supabase was checked during this patch. The privileged tables:

- `admin_audit_log`
- `admin_comment_snapshots`
- `admin_user_controls`
- `profile_media_moderation`
- `profile_media_review_groups`

have RLS enabled and no anon/authenticated policies. They are accessed by trusted server-side service-role code.

## Acceptance criteria

- A non-admin cannot use admin APIs directly.
- Every state-changing admin endpoint has the shared mutation guard.
- Lower/equal roles cannot moderate privileged targets.
- Moderators do not receive account email or Telegram ID from the users endpoint.
- Existing owner/admin/moderator workflows continue to work.
- Admin audit logging remains enabled.
- The build fails if a future mutation route forgets the admin mutation guard.
