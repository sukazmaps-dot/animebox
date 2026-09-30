-- Patch 22 Phase H — Structured Recommendation Feedback 2.0
-- Expands the existing one-row-per-user/title feedback model with explicit
-- reasons. The latest signal remains the source of truth for that title.

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
      'too_long',
      'dislike_genre',
      'dislike_setting',
      'not_now',
      'hidden'
    )
  );

create index if not exists recommendation_feedback_user_signal_updated_idx
  on public.recommendation_feedback(user_id, signal, updated_at desc);

comment on column public.recommendation_feedback.signal is
  'Latest explicit recommendation preference for this user/title. Phase H adds structured negative and temporary feedback reasons.';

comment on column public.recommendation_feedback.metadata is
  'Bounded recommendation context. Phase H also records the feedback policy version for attribution.';
