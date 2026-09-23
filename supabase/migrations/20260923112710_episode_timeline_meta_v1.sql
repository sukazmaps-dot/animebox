create table if not exists public.episode_timeline_meta (
  anime_id bigint not null
    references public.anime_catalog(id)
    on delete cascade,
  episode_number integer not null
    check (episode_number between 1 and 10000),

  duration_ms integer
    check (duration_ms is null or duration_ms between 1000 and 28800000),

  opening_start_ms integer,
  opening_end_ms integer,
  ending_start_ms integer,
  ending_end_ms integer,
  recap_start_ms integer,
  recap_end_ms integer,

  skip_source text,
  skip_confidence real
    check (skip_confidence is null or skip_confidence between 0 and 1),
  skip_lookup_status text not null default 'pending'
    check (skip_lookup_status in ('pending','found','empty','missing_identity','error')),
  skip_checked_at timestamptz,

  video_content_url text,
  video_player_url text,
  video_verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (anime_id, episode_number),

  check (
    opening_start_ms is null or (
      opening_start_ms >= 0 and
      opening_end_ms is not null and
      opening_end_ms > opening_start_ms and
      opening_end_ms <= 28800000
    )
  ),
  check (
    opening_end_ms is null or opening_start_ms is not null
  ),
  check (
    ending_start_ms is null or (
      ending_start_ms >= 0 and
      ending_end_ms is not null and
      ending_end_ms > ending_start_ms and
      ending_end_ms <= 28800000
    )
  ),
  check (
    ending_end_ms is null or ending_start_ms is not null
  ),
  check (
    recap_start_ms is null or (
      recap_start_ms >= 0 and
      recap_end_ms is not null and
      recap_end_ms > recap_start_ms and
      recap_end_ms <= 28800000
    )
  ),
  check (
    recap_end_ms is null or recap_start_ms is not null
  ),
  check (
    duration_ms is null or opening_end_ms is null or opening_end_ms <= duration_ms + 30000
  ),
  check (
    duration_ms is null or ending_end_ms is null or ending_end_ms <= duration_ms + 30000
  ),
  check (
    duration_ms is null or recap_end_ms is null or recap_end_ms <= duration_ms + 30000
  )
);

alter table public.episode_timeline_meta enable row level security;

create index if not exists episode_timeline_meta_skip_checked_idx
  on public.episode_timeline_meta (skip_checked_at desc);

create index if not exists episode_timeline_meta_video_verified_idx
  on public.episode_timeline_meta (video_verified_at desc)
  where video_player_url is not null or video_content_url is not null;

comment on table public.episode_timeline_meta is
  'Server-owned canonical episode timeline metadata for smart playback and Google video discovery.';
