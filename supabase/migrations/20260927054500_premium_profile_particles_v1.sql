-- AnimeBox Patch 18.9.4
-- Persist one lightweight, validated Premium particle preset.

alter table public.premium_profile_settings
  add column if not exists particle_effect text not null default 'none';

update public.premium_profile_settings
set particle_effect = 'none'
where particle_effect is null
   or particle_effect not in ('none', 'nebula', 'sakura', 'stars');

do $$
begin
  alter table public.premium_profile_settings
    add constraint premium_profile_settings_particle_effect_check
    check (particle_effect in ('none', 'nebula', 'sakura', 'stars'));
exception
  when duplicate_object then null;
end $$;
