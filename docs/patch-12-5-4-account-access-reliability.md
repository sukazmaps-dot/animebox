# AnimeBox 12.5.4 — Account & Access Reliability

## Password recovery
The previous recovery email redirected directly to /auth/update-password.
With the SSR/PKCE auth flow that page could run before the recovery code was
exchanged for a Supabase session, so a fresh link could immediately appear
invalid.

New flow:
1. resetPasswordForEmail redirects to /auth/callback?intent=recovery;
2. callback exchanges the PKCE code for a session (or verifies recovery token_hash);
3. Supabase session cookies are written server-side;
4. callback redirects to /auth/update-password;
5. password page validates the authenticated user/session before enabling updateUser.

Recovery deliberately bypasses normal Google onboarding checks.

## Admin concealment
/admin now calls requireAdmin() in the server layout before AdminShell renders.
Guests and users without owner/admin/moderator roles receive the normal 404
surface instead of seeing the control-center navigation followed by API 403s.

API authorization remains unchanged and continues to be required separately.

## Scope
No database migration.
No service-role data reaches the browser.
No player/source code changed in this patch.
