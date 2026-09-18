-- AnimeBox Monetization Reliability v2
-- Stage 2.5 final: integrity review + idempotent admin operations.

alter table public.payment_transactions
  add column if not exists integrity_status text not null default 'ok',
  add column if not exists integrity_note text null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists reviewed_by uuid null references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_transactions_integrity_status_check'
      and conrelid = 'public.payment_transactions'::regclass
  ) then
    alter table public.payment_transactions
      add constraint payment_transactions_integrity_status_check
      check (integrity_status in ('ok', 'needs_review', 'disputed', 'reconciliation_error'));
  end if;
end $$;

create index if not exists payment_transactions_integrity_created_idx
  on public.payment_transactions (integrity_status, created_at desc);

create table if not exists public.monetization_operation_claims (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique check (char_length(operation_key) between 8 and 255),
  operation_type text not null check (char_length(operation_type) between 3 and 100),
  target_type text not null check (char_length(target_type) between 2 and 100),
  target_id text not null check (char_length(target_id) between 1 and 255),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  actor_user_id uuid null references auth.users(id) on delete set null,
  error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists monetization_operation_claims_target_idx
  on public.monetization_operation_claims (target_type, target_id, created_at desc);

alter table public.monetization_operation_claims enable row level security;
-- No browser policies by design. Service-role server routes only.
