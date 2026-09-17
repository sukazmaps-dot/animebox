-- AnimeBox monetization stage 1
-- Run once in Supabase SQL Editor before accepting real Telegram Stars payments.

create table if not exists public.star_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  telegram_id bigint not null,
  chat_id bigint null,
  amount integer not null check (amount > 0),
  currency text not null default 'XTR' check (currency = 'XTR'),
  invoice_payload text not null,
  telegram_payment_charge_id text not null unique,
  provider_payment_charge_id text null,
  created_at timestamptz not null default now()
);

create index if not exists star_payments_telegram_id_idx
  on public.star_payments (telegram_id, created_at desc);

create index if not exists star_payments_user_id_idx
  on public.star_payments (user_id, created_at desc)
  where user_id is not null;

alter table public.star_payments enable row level security;

-- No public RLS policies on purpose: only the service-role server code writes/reads payments.


create table if not exists public.payment_support_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  chat_id bigint not null,
  message text not null check (char_length(message) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists payment_support_requests_status_idx
  on public.payment_support_requests (status, created_at desc);

alter table public.payment_support_requests enable row level security;

-- No public RLS policies: payment support requests are server/admin-only.
