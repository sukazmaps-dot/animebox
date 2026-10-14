-- Apply AFTER application deploy. Provision matching Railway/Vault secret first.
-- Vault name animebox_leaderboard_cron_secret; Railway LEADERBOARD_CRON_SECRET.
do $$ begin
 if not exists(select 1 from vault.secrets where name='animebox_leaderboard_cron_secret') then
 raise exception 'Provision animebox_leaderboard_cron_secret in Vault and LEADERBOARD_CRON_SECRET in Railway first';
 end if;
end $$;
select cron.schedule('animebox-leaderboard-seasons','20 0 * * *',$job$
 select net.http_get(url:='https://youranimebox.com/api/cron/leaderboard-seasons',
 headers:=jsonb_build_object('x-leaderboard-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='animebox_leaderboard_cron_secret')),
 timeout_milliseconds:=55000);
$job$);
select cron.schedule('animebox-leaderboard-seasons-retry','20 1 * * *',$job$
 select net.http_get(url:='https://youranimebox.com/api/cron/leaderboard-seasons',
 headers:=jsonb_build_object('x-leaderboard-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='animebox_leaderboard_cron_secret')),
 timeout_milliseconds:=55000)
 where not exists(select 1 from public.system_job_runs where job_key='leaderboard-seasons' and status='succeeded'
 and started_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'));
$job$);
