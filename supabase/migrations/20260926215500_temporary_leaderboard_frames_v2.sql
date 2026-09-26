-- AnimeBox 18.8b — temporary League frames.
-- Weekly League cosmetics last 7 days after claim; monthly cosmetics last 30 days.
-- Reward history remains permanent even after the visual frame expires.

alter table public.profile_cosmetic_unlocks
  add column if not exists expires_at timestamptz;

create index if not exists profile_cosmetic_unlocks_active_idx
  on public.profile_cosmetic_unlocks (user_id, expires_at desc, cosmetic_key);

-- Backfill already-claimed leaderboard cosmetics using the season type.
update public.profile_cosmetic_unlocks unlock
set expires_at = unlock.unlocked_at + case season.period_type
  when 'month' then interval '30 days'
  else interval '7 days'
end
from public.leaderboard_season_rewards reward
join public.leaderboard_seasons season on season.id = reward.season_id
where unlock.source = 'leaderboard'
  and unlock.source_id = reward.id
  and unlock.expires_at is null;

-- Admin test unlocks are intentionally temporary too.
update public.profile_cosmetic_unlocks
set expires_at = now() + interval '30 days'
where source = 'admin_test'
  and expires_at is null;

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
  period_type text;
  frame_days int;
  frame_expires_at timestamptz;
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

  select season.period_type
    into period_type
  from public.leaderboard_seasons season
  where season.id = reward_row.season_id;

  frame_days := case period_type
    when 'month' then 30
    else 7
  end;

  if reward_row.status = 'claimed' then
    if reward_row.premium_subscription_id is not null then
      select ends_at
        into premium_ends_at
      from public.premium_subscriptions
      where id = reward_row.premium_subscription_id;
    end if;

    if reward_row.cosmetic_key is not null then
      select expires_at
        into frame_expires_at
      from public.profile_cosmetic_unlocks
      where user_id = uid
        and cosmetic_key = reward_row.cosmetic_key;
    end if;

    return jsonb_build_object(
      'reward_id', reward_row.id,
      'status', 'claimed',
      'place', reward_row.place,
      'reward_key', reward_row.reward_key,
      'premium_days', reward_row.premium_days,
      'cosmetic_key', reward_row.cosmetic_key,
      'premium_ends_at', premium_ends_at,
      'frame_expires_at', frame_expires_at,
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
    frame_expires_at := now_ts + make_interval(days => frame_days);

    insert into public.profile_cosmetic_unlocks (
      user_id,
      cosmetic_key,
      source,
      source_id,
      unlocked_at,
      expires_at
    ) values (
      uid,
      reward_row.cosmetic_key,
      'leaderboard',
      reward_row.id,
      now_ts,
      frame_expires_at
    )
    on conflict (user_id, cosmetic_key) do update
    set
      source = excluded.source,
      source_id = excluded.source_id,
      unlocked_at = excluded.unlocked_at,
      expires_at = greatest(
        coalesce(public.profile_cosmetic_unlocks.expires_at, excluded.expires_at),
        excluded.expires_at
      );
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
    'frame_expires_at', frame_expires_at,
    'already_claimed', false
  );
end;
$$;

revoke all on function public.claim_leaderboard_reward(uuid) from public, anon;
grant execute on function public.claim_leaderboard_reward(uuid) to authenticated;

comment on column public.profile_cosmetic_unlocks.expires_at is
  'Temporary League cosmetic expiration. Reward history stays in leaderboard_season_rewards after expiry.';
comment on function public.claim_leaderboard_reward(uuid) is
  'Claims one leaderboard reward idempotently, extends Premium once, and grants a temporary weekly/monthly League frame.';
