# Patch 16.6.9 — Auth Security

## Scope

- Email/password login and registration are routed through a same-origin server endpoint.
- Rate limiting is fail-closed and applied by IP plus normalized email identity.
- Registration requires an 8-character minimum password in AnimeBox UI/API.
- Reserved/system usernames are blocked in UI, server API and PostgreSQL.
- Unicode NFKC + common Cyrillic homoglyph normalization prevents obvious admin/AnimeBox lookalikes.
- Profile rename and onboarding use the same policy.
- Google and Telegram auth flows are unchanged.
- Existing profiles are not renamed automatically.

## Supabase auth setting still required

Enable **Confirm email** in Supabase Auth settings. This setting is owned by Supabase Auth and cannot be changed by a database migration.

After it is enabled, the new server endpoint automatically returns `needsEmailConfirmation: true` and AnimeBox stops treating email/password signup as an authenticated session until the email link is used.

Also enable Supabase leaked-password protection when available for the project.

## RPC / RLS audit

The Security Advisor warning for authenticated SECURITY DEFINER RPCs was reviewed. The current exposed community RPCs are intentionally authenticated user operations and scope writes/reads through `auth.uid()` or ownership checks. They are not admin privilege paths.

Tables with RLS enabled and no policies are deny-by-default for browser roles and are intentionally service-role/server-only unless a dedicated RPC is used.

## Manual verification

1. Try registering `admin`, `аdmin`, `admіn`, `animebox`, `admin123`.
2. Confirm each is rejected.
3. Register a normal username with email confirmation enabled.
4. Confirm no authenticated session exists before clicking the email verification link.
5. Verify Google and Telegram sign-in still work.
