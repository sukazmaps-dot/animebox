-- AnimeBox global database performance v1
-- Safe additive indexes + RLS init-plan optimization.

create index if not exists admin_audit_log_actor_id_idx
  on public.admin_audit_log (actor_id);
create index if not exists admin_comment_snapshots_removed_by_idx
  on public.admin_comment_snapshots (removed_by);
create index if not exists admin_user_controls_updated_by_idx
  on public.admin_user_controls (updated_by);
create index if not exists anime_library_anime_id_idx
  on public.anime_library (anime_id);
create index if not exists boosty_claim_requests_resolved_by_idx
  on public.boosty_claim_requests (resolved_by);
create index if not exists comments_parent_anime_fk_idx
  on public.comments (parent_id, anime_id);
create index if not exists episodes_history_anime_id_idx
  on public.episodes_history (anime_id);
create index if not exists sponsor_admin_notes_updated_by_idx
  on public.sponsor_admin_notes (updated_by);
create index if not exists sponsor_manual_adjustments_actor_user_id_idx
  on public.sponsor_manual_adjustments (actor_user_id);
create index if not exists sponsor_manual_adjustments_voided_by_idx
  on public.sponsor_manual_adjustments (voided_by);
create index if not exists star_payment_events_actor_user_id_idx
  on public.star_payment_events (actor_user_id);
create index if not exists user_achievements_achievement_code_idx
  on public.user_achievements (achievement_code);
create index if not exists user_anime_anime_id_idx
  on public.user_anime (anime_id);

alter policy "Users can read own profile"
  on public.profiles using ((select auth.uid()) = id);
alter policy "Users can create own profile"
  on public.profiles with check ((select auth.uid()) = id);
alter policy "Users can update own profile"
  on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "Users can read own anime tracker"
  on public.user_anime using ((select auth.uid()) = user_id);
alter policy "Users can add own anime tracker"
  on public.user_anime with check ((select auth.uid()) = user_id);
alter policy "Users can update own anime tracker"
  on public.user_anime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own anime tracker"
  on public.user_anime using ((select auth.uid()) = user_id);

alter policy "og_members_read_self"
  on public.og_members using ((select auth.uid()) = user_id);

alter policy "notification_settings_select_own"
  on public.notification_settings using ((select auth.uid()) = user_id);
alter policy "notification_settings_insert_own"
  on public.notification_settings with check ((select auth.uid()) = user_id);
alter policy "notification_settings_update_own"
  on public.notification_settings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "anime_notification_subscriptions_select_own"
  on public.anime_notification_subscriptions using ((select auth.uid()) = user_id);
alter policy "anime_notification_subscriptions_insert_own"
  on public.anime_notification_subscriptions with check ((select auth.uid()) = user_id);
alter policy "anime_notification_subscriptions_update_own"
  on public.anime_notification_subscriptions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "anime_notification_subscriptions_delete_own"
  on public.anime_notification_subscriptions using ((select auth.uid()) = user_id);
