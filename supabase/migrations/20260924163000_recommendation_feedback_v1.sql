-- Patch 17.3 — persistent recommendation feedback
-- Explicit taste signals stay server-side and are consumed by Taste Graph v5.

create table if not exists public.recommendation_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  anime_id bigint not null check (anime_id > 0),
  signal text not null check (signal in ('like_more', 'not_interested', 'already_watched')),
  source text,
  reason text,
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, anime_id)
);

alter table public.recommendation_feedback enable row level security;

drop trigger if exists recommendation_feedback_set_updated_at
  on public.recommendation_feedback;

create trigger recommendation_feedback_set_updated_at
before update on public.recommendation_feedback
for each row
execute function public.set_updated_at();

create index if not exists recommendation_feedback_user_signal_updated_idx
  on public.recommendation_feedback(user_id, signal, updated_at desc);

comment on table public.recommendation_feedback is
  'Server-managed explicit recommendation feedback used by AnimeBox Taste Graph. Browser roles have no direct policies.';
