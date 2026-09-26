-- AnimeBox 18.8 — Product Final / weekly leaderboard rewards.
-- Rewards are materialized after the immutable weekly leaderboard snapshot.
-- The claim RPC is transactional and idempotent: the reward row is locked,
-- Premium is extended once, and the cosmetic unlock is recorded in the same tx.

create table if not exists public.leaderboard_season_rewards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.leaderboard_seasons(id) on delete cascade,
  user_id uuid not null,
  place smallint not null check (place between 1 and 10),
  reward_key text not null,
  premium_days smallint not null default 0 check (premium_days between 0 and 31),
  cosmetic_key text,
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  premium_subscription_id uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (season_id, user_id)
);

create index if not exists leaderboard_season_rewards_user_status_idx
  on public.leaderboard_season_rewards (user_id, status, created_at desc);
create index if not exists leaderboard_season_rewards_season_place_idx
  on public.leaderboard_season_rewards (season_id, place);

create table if not exists public.profile_cosmetic_unlocks (
  user_id uuid not null,
  cosmetic_key text not null,
  source text not null default 'leaderboard',
  source_id uuid,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_key)
);

create table if not exists public.profile_cosmetic_preferences (
  user_id uuid primary key,
  season_frame_key text,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_season_rewards enable row level security;
alter table public.profile_cosmetic_unlocks enable row level security;
alter table public.profile_cosmetic_preferences enable row level security;

revoke all on table public.leaderboard_season_rewards from anon, authenticated;
revoke all on table public.profile_cosmetic_unlocks from anon, authenticated;
revoke all on table public.profile_cosmetic_preferences from anon, authenticated;

grant select, insert, update, delete on table public.leaderboard_season_rewards to service_role;
grant select, insert, update, delete on table public.profile_cosmetic_unlocks to service_role;
grant select, insert, update, delete on table public.profile_cosmetic_preferences to service_role;

create or replace function public.claim_leaderboard_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  reward_row public.leaderboard_season_rewards%rowtype;
  now_ts timestamptz := now();
  base_ends_at timestamptz;
  subscription_id uuid;
  premium_ends_at timestamptz;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into reward_row
  from public.leaderboard_season_rewards
  where id = p_reward_id
    and user_id = uid
  for update;

  if not found then
    raise exception 'REWARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Idempotent response. A duplicate HTTP request never grants Premium twice.
  if reward_row.status = 'claimed' then
    if reward_row.premium_subscription_id is not null then
      select ends_at
        into premium_ends_at
      from public.premium_subscriptions
      where id = reward_row.premium_subscription_id;
    end if;

    return jsonb_build_object(
      'reward_id', reward_row.id,
      'status', 'claimed',
      'place', reward_row.place,
      'reward_key', reward_row.reward_key,
      'premium_days', reward_row.premium_days,
      'cosmetic_key', reward_row.cosmetic_key,
      'premium_ends_at', premium_ends_at,
      'already_claimed', true
    );
  end if;

  if reward_row.premium_days > 0 then
    select greatest(
      now_ts,
      coalesce(max(ends_at), now_ts)
    )
      into base_ends_at
    from public.premium_subscriptions
    where user_id = uid
      and status in ('active', 'grace_period')
      and ends_at > now_ts;

    premium_ends_at := base_ends_at + make_interval(days => reward_row.premium_days);

    insert into public.premium_subscriptions (
      user_id,
      plan,
      status,
      source,
      starts_at,
      ends_at,
      auto_renew,
      metadata
    ) values (
      uid,
      'manual',
      'active',
      'leaderboard',
      now_ts,
      premium_ends_at,
      false,
      jsonb_build_object(
        'leaderboard_reward_id', reward_row.id,
        'season_id', reward_row.season_id,
        'place', reward_row.place,
        'premium_days', reward_row.premium_days
      )
    )
    returning id into subscription_id;
  end if;

  if reward_row.cosmetic_key is not null then
    insert into public.profile_cosmetic_unlocks (
      user_id,
      cosmetic_key,
      source,
      source_id
    ) values (
      uid,
      reward_row.cosmetic_key,
      'leaderboard',
      reward_row.id
    )
    on conflict (user_id, cosmetic_key) do nothing;
  end if;

  update public.leaderboard_season_rewards
  set status = 'claimed',
      claimed_at = now_ts,
      premium_subscription_id = subscription_id
  where id = reward_row.id;

  return jsonb_build_object(
    'reward_id', reward_row.id,
    'status', 'claimed',
    'place', reward_row.place,
    'reward_key', reward_row.reward_key,
    'premium_days', reward_row.premium_days,
    'cosmetic_key', reward_row.cosmetic_key,
    'premium_ends_at', premium_ends_at,
    'already_claimed', false
  );
end;
$$;

revoke all on function public.claim_leaderboard_reward(uuid) from public, anon;
grant execute on function public.claim_leaderboard_reward(uuid) to authenticated;

comment on table public.leaderboard_season_rewards is
  'Immutable weekly leaderboard prize assignments. Claiming changes only status/claim metadata.';
comment on function public.claim_leaderboard_reward(uuid) is
  'Atomically claims one authenticated users weekly leaderboard reward and extends Premium exactly once.';
