-- AnimeBox Boosty Premium Bridge v1
-- Server-only verification state for Boosty -> Telegram private group -> Premium.

create table if not exists public.boosty_premium_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_id bigint not null unique,
  subscription_id uuid null unique references public.premium_subscriptions(id) on delete set null,
  status text not null default 'not_member'
    check (status in ('not_member','active','grace_period','error')),
  member_status text null,
  last_verified_at timestamptz null,
  last_success_at timestamptz null,
  grace_until timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boosty_premium_links_status_idx
  on public.boosty_premium_links (status, last_verified_at asc);

create index if not exists boosty_premium_links_grace_idx
  on public.boosty_premium_links (grace_until)
  where grace_until is not null;

-- Prevent two simultaneous live Boosty leases for the same AnimeBox user.
create unique index if not exists premium_subscriptions_boosty_live_user_uidx
  on public.premium_subscriptions (user_id)
  where source = 'boosty_telegram' and status in ('active','grace_period');

alter table public.boosty_premium_links enable row level security;

-- Deliberately no client RLS policies.
-- All access goes through server routes with service_role.
