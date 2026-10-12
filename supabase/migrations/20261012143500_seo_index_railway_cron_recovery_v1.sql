-- Patch 25.0: restore SEO index refresh after Vercel -> Railway migration.
-- PRECONDITION: operators must create the same random secret in:
--   Railway service variable SEO_INDEX_CRON_SECRET
--   Supabase Vault secret    animebox_seo_index_cron_secret
-- Never store the secret itself in Git, the cron command or an HTTP URL.
-- This migration is intentionally not self-provisioning: missing credentials
-- cause a failure instead of installing an endlessly unauthorized HTTP job.
--
-- Existing CRON_SECRET, cron jobs, and SEO registry rows are untouched.

do $preflight$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
    or not exists (select 1 from pg_extension where extname = 'pg_net')
    or not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception 'SEO cron requires existing pg_cron, pg_net, and Supabase Vault extensions';
  end if;

  if not exists (
    select 1 from vault.secrets
    where name = 'animebox_seo_index_cron_secret'
  ) then
    raise exception 'Set the animebox_seo_index_cron_secret Vault secret before installing SEO cron';
  end if;
end
$preflight$;

-- Primary pass: 7 of 70 source shards per UTC day; full source scan in 10 days.
-- pg_net is asynchronous; cron.job_run_details success only means queued.
-- Application-level execution health is tracked by public.system_job_runs.
select cron.schedule(
  'animebox-seo-anime-index',
  '53 4 * * *',
  $primary$
  select net.http_post(
    url := 'https://youranimebox.com/api/cron/seo-anime-index',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-seo-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'animebox_seo_index_cron_secret'
      )
    ),
    timeout_milliseconds := 55000
  );
  $primary$
);

-- Catch-up for today's SAME source-shard group when the primary pass had no
-- successful application-level run. The HTTP endpoint enforces a refresh lease
-- and workload budget; do not fire parallel jobs to 'catch up' the full index.
select cron.schedule(
  'animebox-seo-anime-index-retry',
  '23 6 * * *',
  $retry$
  select net.http_post(
    url := 'https://youranimebox.com/api/cron/seo-anime-index',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-seo-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'animebox_seo_index_cron_secret'
      )
    ),
    timeout_milliseconds := 55000
  )
  where not exists (
    select 1
    from public.system_job_runs
    where job_key = 'seo-anime-index'
      and status = 'succeeded'
      and started_at >= (
        date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
      )
  );
  $retry$
);

-- To disable both jobs without touching any other service:
-- select cron.unschedule('animebox-seo-anime-index');
-- select cron.unschedule('animebox-seo-anime-index-retry');
