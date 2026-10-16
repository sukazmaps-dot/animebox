-- PROPOSED PATCH 31.2 ONLY. Apply manually after explicit approval.
-- Existing columns banner_color and banner_color_mode were added in Patch 30.9.
-- Null on old rows is treated as 'soft' by the application. No data updates.
-- Metadata-only change; no EXPLAIN query plan applies. Short ACCESS EXCLUSIVE lock.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_style text DEFAULT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_banner_style_allowed
  CHECK (banner_style IS NULL OR banner_style IN ('solid','soft','sunset','glow')) NOT VALID;
-- Separate approval: ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_banner_style_allowed;
