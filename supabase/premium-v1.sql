-- AnimeBox Premium v1
create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly','yearly','manual')),
  status text not null default 'active'
    check (status in ('active','grace_period','expired','cancelled','refunded')),
  source text not null check (char_length(source) between 2 and 64),
  transaction_id uuid null unique references public.payment_transactions(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists premium_subscriptions_user_status_idx
  on public.premium_subscriptions (user_id, status, ends_at desc);

create index if not exists premium_subscriptions_active_idx
  on public.premium_subscriptions (ends_at)
  where status in ('active','grace_period');

alter table public.premium_subscriptions enable row level security;

insert into public.payment_products (code, name, product_type, active, metadata)
values
  ('premium_monthly', 'AnimeBox Premium · месяц', 'subscription', false,
    '{"entitlements":["adFree","premiumBadge","profileStudio","animatedAvatar","extraShowcases","premiumThemes"]}'::jsonb),
  ('premium_yearly', 'AnimeBox Premium · год', 'subscription', false,
    '{"entitlements":["adFree","premiumBadge","profileStudio","animatedAvatar","extraShowcases","premiumThemes"]}'::jsonb)
on conflict (code) do update
set
  name = excluded.name,
  product_type = excluded.product_type,
  metadata = excluded.metadata,
  updated_at = now();
