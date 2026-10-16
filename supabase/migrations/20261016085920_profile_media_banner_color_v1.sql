-- Additive: preserve existing media paths, quarantined uploads and entitlement data.
alter table public.profiles
  add column if not exists banner_color text not null default '#70618c',
  add column if not exists banner_color_mode text not null default 'auto';
alter table public.profiles
  add constraint profiles_banner_color_hex check (banner_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint profiles_banner_color_mode_valid check (banner_color_mode in ('auto', 'manual'));
comment on column public.profiles.banner_color is 'Fallback banner color for all profiles, including expired Premium.';
comment on column public.profiles.banner_color_mode is 'auto samples avatar on replacement; manual preserves user color.';
-- Existing own-row SELECT + UPDATE policies apply to these columns too.
-- Do not grant browser writes to public/quarantine objects: upload-url issues an
-- owned, single-use signed path after entitlement checks; publishing revalidates bytes.
-- The 8 MiB bucket ceiling is for Premium animation, NOT the static image budget.
update storage.buckets set file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id in ('profile-media','profile-media-quarantine');
-- avatars/banners are logical kinds in this installation. No unused parallel buckets.
-- avatar_url/banner_url already exist and are server-managed compatibility fields.
-- is_premium must be derived from active, unexpired entitlements, never user-writable.
