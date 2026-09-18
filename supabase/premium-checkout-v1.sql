-- AnimeBox Premium checkout catalog v1
update public.payment_products
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'duration_days',
  case code when 'premium_monthly' then 30 when 'premium_yearly' then 365 else null end,
  'telegram_stars_amount',
  case
    when jsonb_typeof(metadata->'telegram_stars_amount') = 'number'
      then (metadata->>'telegram_stars_amount')::int
    else null
  end
),
updated_at = now()
where code in ('premium_monthly','premium_yearly');
