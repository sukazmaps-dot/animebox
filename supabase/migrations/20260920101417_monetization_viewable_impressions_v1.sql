CREATE OR REPLACE FUNCTION public.get_monetization_dashboard(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
params as (
  select
    case when p_days = 7 then 7 else 30 end::integer as days,
    now() as now_ts,
    now() - make_interval(days => case when p_days = 7 then 7 else 30 end) as period_start
),
live_subscriptions as (
  select ps.*
  from public.premium_subscriptions ps, params p
  where ps.status in ('active', 'grace_period')
    and ps.ends_at > p.now_ts
),
canonical_live_subscriptions as (
  select user_id, source
  from (
    select
      ls.user_id,
      ls.source,
      row_number() over (
        partition by ls.user_id
        order by
          case ls.source
            when 'telegram_stars' then 1
            when 'boosty_telegram' then 2
            when 'admin' then 3
            else 4
          end,
          ls.starts_at desc,
          ls.ends_at desc,
          ls.id desc
      ) as source_rank
    from live_subscriptions ls
    where ls.user_id is not null
  ) ranked
  where source_rank = 1
),
premium_kpis as (
  select
    (select count(*)::integer from canonical_live_subscriptions) as active_premium,
    (
      select count(distinct ps.user_id)::integer
      from public.premium_subscriptions ps, params p
      where ps.starts_at >= p.now_ts - interval '7 days'
    ) as new_premium_7d,
    (
      select count(distinct ps.user_id)::integer
      from public.premium_subscriptions ps, params p
      where ps.starts_at >= p.now_ts - interval '30 days'
    ) as new_premium_30d,
    (
      select count(*)::integer
      from public.premium_subscriptions ps, params p
      where ps.status = 'expired'
        and ps.ends_at >= p.period_start
        and ps.ends_at <= p.now_ts
    ) as expirations,
    (
      select count(*)::integer
      from public.premium_subscriptions ps, params p
      where coalesce(ps.auto_renew_cancelled_at, ps.cancelled_at) is not null
        and coalesce(ps.auto_renew_cancelled_at, ps.cancelled_at) >= p.period_start
        and coalesce(ps.auto_renew_cancelled_at, ps.cancelled_at) <= p.now_ts
    ) as cancellations,
    (
      select count(*)::integer
      from live_subscriptions ls, params p
      where ls.ends_at <= p.now_ts + interval '7 days'
    ) as expiring_next_7d
),
source_breakdown as (
  select
    count(*) filter (where source = 'telegram_stars')::integer as telegram_stars,
    count(*) filter (where source = 'boosty_telegram')::integer as boosty_telegram,
    count(*) filter (where source = 'admin')::integer as admin,
    count(*) filter (
      where source is null
        or source not in ('telegram_stars', 'boosty_telegram', 'admin')
    )::integer as other
  from canonical_live_subscriptions
),
period_payments as (
  select pt.*
  from public.payment_transactions pt, params p
  where pt.archived_at is null
    and pt.status = 'paid'
    and coalesce(pt.paid_at, pt.created_at) >= p.period_start
    and coalesce(pt.paid_at, pt.created_at) <= p.now_ts
),
revenue_kpis as (
  select
    coalesce(sum(amount) filter (
      where provider = 'telegram_stars' and currency = 'XTR'
    ), 0)::numeric as stars_revenue,
    coalesce(sum(amount) filter (
      where provider = 'telegram_stars'
        and product_code = 'sponsor_support'
        and currency = 'XTR'
    ), 0)::numeric as sponsor_revenue_stars
  from period_payments
),
donatepay_currency as (
  select
    currency,
    sum(amount)::numeric as amount
  from period_payments
  where provider = 'donatepay'
    and integrity_status = 'ok'
  group by currency
),
donatepay_revenue as (
  select coalesce(jsonb_object_agg(currency, amount), '{}'::jsonb) as by_currency
  from donatepay_currency
),
boosty_kpis as (
  select count(distinct user_id)::integer as verified_users
  from public.boosty_premium_links
  where status in ('active', 'grace_period')
    and last_success_at is not null
),
period_events as (
  select me.*
  from public.monetization_events me, params p
  where me.created_at >= p.period_start
    and me.created_at <= p.now_ts
),
event_actors as (
  select
    event_name,
    source,
    case
      when user_id is not null then 'u:' || user_id::text
      when session_id is not null then 's:' || session_id
      when entity_id is not null then 'e:' || entity_id
      else 'i:' || id::text
    end as actor_key
  from period_events
),
funnel_counts as (
  select
    count(distinct actor_key) filter (where event_name = 'premium_page_view' and source = 'premium_page')::integer as views,
    count(distinct actor_key) filter (where event_name = 'premium_checkout_started' and source = 'telegram_stars')::integer as checkout_started,
    count(distinct actor_key) filter (where event_name = 'premium_payment_success' and source = 'telegram_stars')::integer as payment_success,
    count(distinct actor_key) filter (where event_name = 'premium_activated' and source = 'telegram_stars')::integer as activated
  from event_actors
),
ad_counts as (
  select
    count(*) filter (where event_name = 'ad_slot_requested')::integer as requested,
    count(*) filter (where event_name = 'ad_slot_filled')::integer as filled,
    count(*) filter (where event_name = 'ad_slot_impression')::integer as impressions,
    count(*) filter (where event_name = 'ad_slot_no_fill')::integer as no_fill,
    count(*) filter (where event_name = 'ad_slot_clicked')::integer as clicks,
    count(*) filter (
      where event_name = 'ad_slot_filled'
        and coalesce(metadata->>'provider', source, '') = 'house'
    )::integer as house_fills,
    count(*) filter (
      where event_name = 'ad_slot_impression'
        and coalesce(metadata->>'provider', source, '') = 'house'
    )::integer as house_impressions
  from period_events
),
days as (
  select generate_series(
    (p.now_ts::date - (p.days - 1)),
    p.now_ts::date,
    interval '1 day'
  )::date as day
  from params p
),
events_daily as (
  select
    created_at::date as day,
    count(*) filter (where event_name = 'premium_page_view')::integer as premium_views,
    count(*) filter (where event_name = 'premium_checkout_started')::integer as checkouts,
    count(*) filter (where event_name = 'ad_slot_requested')::integer as ad_requests,
    count(*) filter (where event_name = 'ad_slot_filled')::integer as ad_fills,
    count(*) filter (where event_name = 'ad_slot_impression')::integer as ad_impressions,
    count(*) filter (where event_name = 'ad_slot_no_fill')::integer as ad_no_fill
  from period_events
  group by created_at::date
),
payments_daily as (
  select
    coalesce(paid_at, created_at)::date as day,
    coalesce(sum(amount) filter (
      where provider = 'telegram_stars' and currency = 'XTR'
    ), 0)::numeric as stars_revenue,
    coalesce(sum(amount) filter (
      where provider = 'telegram_stars'
        and product_code = 'sponsor_support'
        and currency = 'XTR'
    ), 0)::numeric as sponsor_revenue_stars,
    coalesce(sum(amount) filter (
      where provider = 'donatepay'
        and integrity_status = 'ok'
        and currency = 'RUB'
    ), 0)::numeric as donatepay_revenue_rub
  from period_payments
  group by coalesce(paid_at, created_at)::date
),
subscriptions_daily as (
  select
    starts_at::date as day,
    count(*)::integer as premium_activations
  from public.premium_subscriptions ps, params p
  where ps.starts_at >= p.period_start
    and ps.starts_at <= p.now_ts
  group by starts_at::date
),
time_series as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.day,
        'premiumActivations', coalesce(sd.premium_activations, 0),
        'premiumViews', coalesce(ed.premium_views, 0),
        'checkouts', coalesce(ed.checkouts, 0),
        'starsRevenue', coalesce(pd.stars_revenue, 0),
        'sponsorRevenueStars', coalesce(pd.sponsor_revenue_stars, 0),
        'donatePayRevenueRub', coalesce(pd.donatepay_revenue_rub, 0),
        'adRequests', coalesce(ed.ad_requests, 0),
        'adFills', coalesce(ed.ad_fills, 0),
        'adImpressions', coalesce(ed.ad_impressions, 0),
        'adNoFill', coalesce(ed.ad_no_fill, 0)
      ) order by d.day
    ),
    '[]'::jsonb
  ) as value
  from days d
  left join events_daily ed on ed.day = d.day
  left join payments_daily pd on pd.day = d.day
  left join subscriptions_daily sd on sd.day = d.day
),
recent_payment_rows as (
  select
    pt.id,
    pt.user_id,
    p.username,
    pt.provider,
    pt.product_code,
    pt.status,
    pt.amount,
    pt.currency,
    pt.paid_at,
    pt.created_at,
    coalesce(pt.paid_at, pt.created_at) as sort_at
  from public.payment_transactions pt
  left join public.profiles p on p.id = pt.user_id
  where pt.archived_at is null
    and pt.product_code in ('premium_monthly', 'premium_yearly', 'sponsor_support', 'donation_once')
    and pt.status in ('paid', 'refunded', 'partially_refunded')
  order by coalesce(pt.paid_at, pt.created_at) desc, pt.id desc
  limit 12
),
recent_payments as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'userId', user_id,
        'username', username,
        'provider', provider,
        'productCode', product_code,
        'status', status,
        'amount', amount,
        'currency', currency,
        'paidAt', paid_at,
        'createdAt', created_at
      ) order by sort_at desc
    ),
    '[]'::jsonb
  ) as value
  from recent_payment_rows
)
select jsonb_build_object(
  'rangeDays', p.days,
  'generatedAt', p.now_ts,
  'kpis', jsonb_build_object(
    'activePremium', pk.active_premium,
    'newPremium7d', pk.new_premium_7d,
    'newPremium30d', pk.new_premium_30d,
    'starsRevenue', rk.stars_revenue,
    'boostyVerifiedUsers', bk.verified_users,
    'donatePayRevenueByCurrency', dr.by_currency,
    'sponsorRevenueStars', rk.sponsor_revenue_stars,
    'expirations', pk.expirations,
    'cancellations', pk.cancellations,
    'expiringNext7d', pk.expiring_next_7d
  ),
  'sourceBreakdown', jsonb_build_object(
    'telegram_stars', sb.telegram_stars,
    'boosty_telegram', sb.boosty_telegram,
    'admin', sb.admin,
    'other', sb.other
  ),
  'funnel', jsonb_build_object(
    'views', fc.views,
    'checkoutStarted', fc.checkout_started,
    'paymentSuccess', fc.payment_success,
    'activated', fc.activated,
    'viewToCheckoutPct', coalesce(round(100.0 * fc.checkout_started / nullif(fc.views, 0), 2), 0),
    'checkoutToActivatedPct', coalesce(round(100.0 * fc.activated / nullif(fc.checkout_started, 0), 2), 0),
    'viewToActivatedPct', coalesce(round(100.0 * fc.activated / nullif(fc.views, 0), 2), 0)
  ),
  'ads', jsonb_build_object(
    'requested', ac.requested,
    'filled', ac.filled,
    'impressions', ac.impressions,
    'noFill', ac.no_fill,
    'clicks', ac.clicks,
    'houseFills', ac.house_fills,
    'houseImpressions', ac.house_impressions,
    'fillRatePct', coalesce(round(100.0 * ac.filled / nullif(ac.requested, 0), 2), 0),
    'viewabilityPct', coalesce(round(100.0 * ac.impressions / nullif(ac.filled, 0), 2), 0),
    'noFillRatePct', coalesce(round(100.0 * ac.no_fill / nullif(ac.requested, 0), 2), 0),
    'ctrPct', case
      when ac.house_impressions > 0 then round(100.0 * ac.clicks / ac.house_impressions, 2)
      else null
    end,
    'ctrScope', case when ac.house_impressions > 0 then 'house_only' else 'unavailable' end
  ),
  'timeSeries', ts.value,
  'recentPayments', rp.value
)
from params p
cross join premium_kpis pk
cross join source_breakdown sb
cross join revenue_kpis rk
cross join donatepay_revenue dr
cross join boosty_kpis bk
cross join funnel_counts fc
cross join ad_counts ac
cross join time_series ts
cross join recent_payments rp;
$function$

