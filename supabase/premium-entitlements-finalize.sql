-- AnimeBox Premium v1 entitlement finalization
-- Only ship benefits that already exist in production.

update public.payment_products
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{entitlements}',
  '["adFree","premiumBadge","profileStudio","premiumThemes"]'::jsonb,
  true
),
updated_at = now()
where code in ('premium_monthly','premium_yearly');

update public.user_entitlements
set active = false,
    updated_at = now()
where source = 'premium'
  and entitlement in ('animatedAvatar','extraShowcases');
