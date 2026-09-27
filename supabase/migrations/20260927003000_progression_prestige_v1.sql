-- AnimeBox Patch 18.9 — Progression & Prestige.
-- Prestige is additive: reaching LV100 never resets or subtracts XP.
-- Premium remains a visual entitlement only; historical premium_bonus_xp is preserved.

alter table public.user_progression
  add column if not exists prestige_tier smallint not null default 0,
  add column if not exists prestige_unlocked_at timestamptz;

do $$
begin
  alter table public.user_progression
    add constraint user_progression_prestige_tier_check
    check (prestige_tier between 0 and 1);
exception
  when duplicate_object then null;
end
$$;

create or replace function public.animebox_progression_prestige_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- LV100 threshold from the current progression curve: xpForLevel(100) = 205920.
  if coalesce(new.total_xp, 0) >= 205920 then
    new.prestige_tier := greatest(coalesce(new.prestige_tier, 0), 1);
    new.prestige_unlocked_at := coalesce(new.prestige_unlocked_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists user_progression_prestige_guard
  on public.user_progression;

create trigger user_progression_prestige_guard
before insert or update of total_xp
on public.user_progression
for each row
execute function public.animebox_progression_prestige_guard();

update public.user_progression
set prestige_tier = 1,
    prestige_unlocked_at = coalesce(prestige_unlocked_at, now())
where total_xp >= 205920
  and prestige_tier < 1;

comment on column public.user_progression.prestige_tier is
  'AnimeBox prestige tier. Tier 1 unlocks at LV100 without resetting XP.';
comment on column public.user_progression.prestige_unlocked_at is
  'First time the account reached Prestige I. XP is never reset.';
