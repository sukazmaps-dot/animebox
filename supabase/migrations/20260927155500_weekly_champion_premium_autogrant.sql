-- AnimeBox recovery — weekly champion Premium auto-grant.
-- Top-1 weekly Premium is granted automatically when a new immutable reward row
-- is materialized. The reward itself stays pending so the cosmetic can still be
-- claimed in the UI. claim_leaderboard_reward is made aware of pre-granted Premium.

create or replace function public.animebox_autogrant_weekly_champion_premium()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ts timestamptz := now();
  base_ends_at timestamptz;
  subscription_id uuid;
  premium_ends_at timestamptz;
begin
  if new.reward_key <> 'weekly_champion'
     or coalesce(new.premium_days, 0) <= 0
     or new.premium_subscription_id is not null then
    return new;
  end if;

  select greatest(
    now_ts,
    coalesce(max(ends_at), now_ts)
  )
    into base_ends_at
  from public.premium_subscriptions
  where user_id = new.user_id
    and status in ('active', 'grace_period')
    and ends_at > now_ts;

  premium_ends_at := base_ends_at + make_interval(days => new.premium_days);

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
    new.user_id,
    'manual',
    'active',
    'leaderboard',
    now_ts,
    premium_ends_at,
    false,
    jsonb_build_object(
      'leaderboard_reward_id', new.id,
      'season_id', new.season_id,
      'place', new.place,
      'premium_days', new.premium_days,
      'auto_granted', true
    )
  )
  returning id into subscription_id;

  update public.leaderboard_season_rewards
  set premium_subscription_id = subscription_id
  where id = new.id
    and premium_subscription_id is null;

  return new;
end;
$$;

drop trigger if exists leaderboard_weekly_champion_premium_autogrant
  on public.leaderboard_season_rewards;

create trigger leaderboard_weekly_champion_premium_autogrant
after insert
on public.leaderboard_season_rewards
for each row
when (new.reward_key = 'weekly_champion' and new.premium_days > 0)
execute function public.animebox_autogrant_weekly_champion_premium();

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

  subscription_id := reward_row.premium_subscription_id;

  if reward_row.status = 'claimed' then
    if subscription_id is not null then
      select ends_at
        into premium_ends_at
      from public.premium_subscriptions
      where id = subscription_id;
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

  -- Weekly champion Premium may already have been granted automatically.
  -- Reuse that subscription instead of extending Premium a second time.
  if subscription_id is not null then
    select ends_at
      into premium_ends_at
    from public.premium_subscriptions
    where id = subscription_id;
  elsif reward_row.premium_days > 0 then
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
        'premium_days', reward_row.premium_days,
        'auto_granted', false
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

comment on function public.animebox_autogrant_weekly_champion_premium() is
  'Automatically grants weekly Top-1 temporary Premium once when its immutable reward row is inserted.';
