-- AnimeBox Premium recurring subscription v1

alter table public.premium_subscriptions
  add column if not exists auto_renew boolean not null default false,
  add column if not exists auto_renew_cancelled_at timestamptz null,
  add column if not exists telegram_subscription_charge_id text null;

create unique index if not exists premium_subscriptions_telegram_charge_uidx
  on public.premium_subscriptions (telegram_subscription_charge_id)
  where telegram_subscription_charge_id is not null;

create index if not exists premium_subscriptions_recurring_user_idx
  on public.premium_subscriptions (user_id, plan, auto_renew, ends_at desc)
  where source = 'telegram_stars';

update public.payment_products
set metadata = coalesce(metadata, '{}'::jsonb) ||
  case code
    when 'premium_monthly' then jsonb_build_object(
      'billing_mode', 'recurring',
      'subscription_period_seconds', 2592000,
      'duration_days', 30
    )
    when 'premium_yearly' then jsonb_build_object(
      'billing_mode', 'prepaid',
      'duration_days', 365
    )
    else '{}'::jsonb
  end,
  updated_at = now()
where code in ('premium_monthly','premium_yearly');
