-- AnimeBox Boosty manual verification + historical DonatePay archive.
alter table public.payment_transactions
  add column if not exists archived_at timestamptz null,
  add column if not exists archive_reason text null;

create table if not exists public.boosty_claim_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boosty_name text not null,
  amount numeric(18,4) not null,
  currency text not null default 'RUB',
  note text null,
  status text not null default 'pending',
  transaction_id uuid null unique references public.payment_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  admin_note text null
);
