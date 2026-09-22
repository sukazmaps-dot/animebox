# AnimeBox 12.5.4 — Account & Access Reliability

## Password recovery
The previous recovery email redirected directly to /auth/update-password.
With the SSR/PKCE auth flow that page could run before the recovery code was
exchanged for a Supabase session, so a fresh link could immediately appear
invalid.

New flow:
1. resetPasswordForEmail keeps the already-known /auth/update-password redirect;
2. the client page reads the one-time PKCE code (or recovery token_hash);
3. it exchanges/verifies that value with Supabase before calling getUser/getSession;
4. the one-time code is removed from the address bar immediately after success;
5. only an authenticated recovery session can enable updateUser.

The server /auth/callback route also understands recovery links as a defensive
fallback, but password recovery no longer depends on that path being allowlisted
in Supabase Redirect URLs.

## Admin concealment
/admin now calls requireAdmin() in the server layout before AdminShell renders.
Guests and users without owner/admin/moderator roles receive the normal 404
surface instead of seeing the control-center navigation followed by API 403s.

API authorization remains unchanged and continues to be required separately.

## Scope
No database migration.
No service-role data reaches the browser.
No player/source code changed in this patch.
