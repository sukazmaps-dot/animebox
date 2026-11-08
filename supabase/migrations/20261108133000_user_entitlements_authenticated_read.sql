-- Allow authenticated users to read only their own entitlements.
-- save_my_profile_identity runs as the caller and checks extraShowcases.
grant select on table public.user_entitlements to authenticated;

drop policy if exists user_entitlements_authenticated_select_own
  on public.user_entitlements;

create policy user_entitlements_authenticated_select_own
  on public.user_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
