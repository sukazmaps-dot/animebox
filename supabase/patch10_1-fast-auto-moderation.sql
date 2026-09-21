-- AnimeBox Patch 10.1 · Fast Auto Moderation
-- Persistent automatic retry queue for profile avatar/banner moderation.

alter table public.profile_media_review_groups
  add column if not exists automation_state text not null default 'manual',
  add column if not exists auto_attempts integer not null default 0,
  add column if not exists next_auto_check_at timestamptz,
  add column if not exists last_auto_check_at timestamptz,
  add column if not exists auto_last_reason text;

alter table public.profile_media_review_groups
  drop constraint if exists profile_media_review_groups_automation_state_check,
  drop constraint if exists profile_media_review_groups_auto_attempts_check;

alter table public.profile_media_review_groups
  add constraint profile_media_review_groups_automation_state_check
    check (automation_state in ('manual', 'retry', 'processing', 'done')),
  add constraint profile_media_review_groups_auto_attempts_check
    check (auto_attempts between 0 and 20);

update public.profile_media_review_groups
set automation_state = case
  when status = 'review' then coalesce(nullif(automation_state, ''), 'manual')
  else 'done'
end
where automation_state is null
   or automation_state = ''
   or status <> 'review';

create index if not exists profile_media_review_groups_auto_retry_idx
  on public.profile_media_review_groups (next_auto_check_at asc)
  where status = 'review' and automation_state = 'retry';

-- Store the cron secret only in Supabase Vault.
do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'animebox_profile_media_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'animebox_profile_media_cron_secret',
      'AnimeBox profile media automatic moderation worker'
    );
  end if;
end
$$;

create or replace function public.verify_internal_job_secret(
  job_name text,
  candidate text
)
returns boolean
language sql
security definer
set search_path = public, extensions, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = job_name
      and encode(digest(decrypted_secret, 'sha256'), 'hex')
        = encode(digest(candidate, 'sha256'), 'hex')
  );
$$;

revoke all on function public.verify_internal_job_secret(text, text) from public;
revoke all on function public.verify_internal_job_secret(text, text) from anon;
revoke all on function public.verify_internal_job_secret(text, text) from authenticated;
grant execute on function public.verify_internal_job_secret(text, text) to service_role;

-- Run after the matching application deploy is live.
-- Supabase Cron supports sub-minute schedules on supported Postgres versions.
select cron.schedule(
  'animebox-profile-media-auto-review',
  '30 seconds',
  $job$
    select net.http_post(
      url := 'https://youranimebox.com/api/cron/profile-media-moderation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-animebox-job-secret',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'animebox_profile_media_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);

-- Keep the job inactive until the application endpoint is deployed.
select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'animebox-profile-media-auto-review'
    limit 1
  ),
  active := false
);
