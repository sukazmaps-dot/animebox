-- Patch 17.8.1 — Discovery Engine 2.0 / Data Foundation
-- Recommendation telemetry keeps using product_events instead of creating a
-- second event pipeline. New columns make attribution directly queryable.

alter table if exists public.product_events
  add column if not exists anonymous_id text,
  add column if not exists recommendation_id text,
  add column if not exists recommendation_session_id text,
  add column if not exists algorithm_version text;

alter table if exists public.product_events
  drop constraint if exists product_events_anonymous_id_length_check;
alter table if exists public.product_events
  add constraint product_events_anonymous_id_length_check
  check (anonymous_id is null or char_length(anonymous_id) between 8 and 100);

alter table if exists public.product_events
  drop constraint if exists product_events_recommendation_id_length_check;
alter table if exists public.product_events
  add constraint product_events_recommendation_id_length_check
  check (recommendation_id is null or char_length(recommendation_id) between 8 and 120);

alter table if exists public.product_events
  drop constraint if exists product_events_recommendation_session_length_check;
alter table if exists public.product_events
  add constraint product_events_recommendation_session_length_check
  check (
    recommendation_session_id is null
    or char_length(recommendation_session_id) between 8 and 100
  );

alter table if exists public.product_events
  drop constraint if exists product_events_algorithm_version_length_check;
alter table if exists public.product_events
  add constraint product_events_algorithm_version_length_check
  check (
    algorithm_version is null
    or char_length(algorithm_version) between 2 and 80
  );

create index if not exists product_events_recommendation_created_idx
  on public.product_events(recommendation_id, created_at desc)
  where recommendation_id is not null;

create index if not exists product_events_recommendation_session_created_idx
  on public.product_events(recommendation_session_id, created_at desc)
  where recommendation_session_id is not null;

create index if not exists product_events_algorithm_created_idx
  on public.product_events(algorithm_version, created_at desc)
  where algorithm_version is not null;

create index if not exists product_events_anonymous_created_idx
  on public.product_events(anonymous_id, created_at desc)
  where anonymous_id is not null and user_id is null;

alter table public.recommendation_feedback
  add column if not exists recommendation_id text,
  add column if not exists recommendation_session_id text,
  add column if not exists algorithm_version text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.recommendation_feedback
  drop constraint if exists recommendation_feedback_signal_check;

alter table public.recommendation_feedback
  add constraint recommendation_feedback_signal_check
  check (
    signal in (
      'like_more',
      'not_interested',
      'already_watched',
      'less_like_this',
      'hidden'
    )
  );

alter table public.recommendation_feedback
  drop constraint if exists recommendation_feedback_recommendation_id_length_check;
alter table public.recommendation_feedback
  add constraint recommendation_feedback_recommendation_id_length_check
  check (
    recommendation_id is null
    or char_length(recommendation_id) between 8 and 120
  );

alter table public.recommendation_feedback
  drop constraint if exists recommendation_feedback_recommendation_session_length_check;
alter table public.recommendation_feedback
  add constraint recommendation_feedback_recommendation_session_length_check
  check (
    recommendation_session_id is null
    or char_length(recommendation_session_id) between 8 and 100
  );

alter table public.recommendation_feedback
  drop constraint if exists recommendation_feedback_algorithm_version_length_check;
alter table public.recommendation_feedback
  add constraint recommendation_feedback_algorithm_version_length_check
  check (
    algorithm_version is null
    or char_length(algorithm_version) between 2 and 80
  );

create index if not exists recommendation_feedback_algorithm_updated_idx
  on public.recommendation_feedback(algorithm_version, updated_at desc)
  where algorithm_version is not null;

comment on column public.product_events.anonymous_id is
  'Random first-party AnimeBox identifier for guest analytics; contains no device or location data.';
comment on column public.product_events.recommendation_id is
  'Unique recommendation exposure identifier propagated from card impression through watch milestones.';
comment on column public.product_events.recommendation_session_id is
  'Smart Feed session identifier, separate from the general product analytics session.';
comment on column public.product_events.algorithm_version is
  'Versioned recommendation algorithm contract, starting with 17.8-v1.';
comment on column public.recommendation_feedback.metadata is
  'Bounded recommendation UI context such as row, position and mood.';
