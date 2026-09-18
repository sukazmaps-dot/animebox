-- AnimeBox DonatePay claim v1
-- Securely links a DonatePay transaction to an authenticated AnimeBox user.
-- The plaintext claim code is never stored; only its SHA-256 hash is persisted.

create table if not exists public.payment_claim_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'donatepay' check (provider = 'donatepay'),
  claim_hash text not null unique check (char_length(claim_hash) = 64),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'expired', 'cancelled')),
  transaction_id uuid null unique references public.payment_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (status = 'claimed' and transaction_id is not null and claimed_at is not null)
    or status <> 'claimed'
  )
);

create index if not exists payment_claim_intents_user_created_idx
  on public.payment_claim_intents (user_id, created_at desc);

create index if not exists payment_claim_intents_pending_idx
  on public.payment_claim_intents (provider, status, expires_at)
  where status = 'pending';

create unique index if not exists payment_claim_intents_one_pending_user_idx
  on public.payment_claim_intents (user_id, provider)
  where status = 'pending';

alter table public.payment_claim_intents enable row level security;
