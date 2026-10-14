-- Patch 29.6–29.8. Apply transactionally before deploying the application.
-- Backfill and trigger installation hold the SAME lock: no racing increments.
set lock_timeout = '5s';
lock table animebox_watch.heartbeats in share row exclusive mode;
lock table animebox_watch.sessions in share row exclusive mode;
create table animebox_watch.leaderboard_daily_activity (
 user_id uuid not null references public.profiles(id) on delete cascade,
 episode_id uuid not null references animebox_watch.episodes(id) on delete cascade,
 activity_date date not null,
 accepted_ms bigint not null check (accepted_ms >= 0),
 last_watched_at timestamptz not null,
 primary key(user_id,episode_id,activity_date)
);
create index leaderboard_daily_date_user_idx on animebox_watch.leaderboard_daily_activity(activity_date,user_id);
create table animebox_watch.leaderboard_coverage (
 singleton boolean primary key default true check(singleton),
 covered_from timestamptz not null,
 calculation_version text not null default 'durable-periods-v1'
);
-- Conservative lower bound: first surviving day may have been partly purged.
insert into animebox_watch.leaderboard_coverage(singleton,covered_from)
select true, (date_trunc('day',coalesce(min(received_at),now()) at time zone 'UTC') + interval '1 day') at time zone 'UTC'
from animebox_watch.heartbeats;
insert into animebox_watch.leaderboard_daily_activity
select s.user_id,s.episode_id,(h.received_at at time zone 'UTC')::date,
 sum(h.accepted_ms)::bigint,max(h.received_at)
from animebox_watch.heartbeats h join animebox_watch.sessions s on s.id=h.session_id
where h.accepted_ms>0 group by 1,2,3;

create function animebox_watch.aggregate_leaderboard_heartbeat()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; episode_uuid uuid; delta bigint;
begin
 if TG_OP='UPDATE' and (new.session_id<>old.session_id or new.seq<>old.seq or new.received_at<>old.received_at) then
   raise exception 'HEARTBEAT_IDENTITY_IMMUTABLE';
 end if;
 delta := new.accepted_ms;
 if TG_OP='UPDATE' then delta:=new.accepted_ms-old.accepted_ms; end if;
 if delta=0 then return new; end if;
 select user_id,episode_id into strict owner_id,episode_uuid from animebox_watch.sessions where id=new.session_id;
 insert into animebox_watch.leaderboard_daily_activity as d
 values(owner_id,episode_uuid,(new.received_at at time zone 'UTC')::date,greatest(delta,0),new.received_at)
 on conflict(user_id,episode_id,activity_date) do update
 set accepted_ms=d.accepted_ms+delta,last_watched_at=greatest(d.last_watched_at,excluded.last_watched_at);
 return new;
end $$;
revoke all on function animebox_watch.aggregate_leaderboard_heartbeat() from public,anon,authenticated;
create trigger leaderboard_heartbeat_aggregate after insert or update on animebox_watch.heartbeats
for each row execute function animebox_watch.aggregate_leaderboard_heartbeat();
-- Do not decrement aggregates on DELETE: retention deletes technical history.

create table animebox_watch.leaderboard_trust_restrictions (
 user_id uuid not null references public.profiles(id) on delete cascade,
 assessed_at timestamptz not null,
 policy_version text not null default 'watch-trust-v1',
 primary key(user_id,assessed_at)
);
lock table public.product_events in share row exclusive mode;
insert into animebox_watch.leaderboard_trust_restrictions(user_id,assessed_at)
select distinct user_id,created_at from public.product_events
where user_id is not null and event_name='watch_trust_assessed' and metadata->>'state'='high_risk'
on conflict do nothing;
create function animebox_watch.persist_leaderboard_restriction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is not null and new.event_name='watch_trust_assessed' and new.metadata->>'state'='high_risk' then
  insert into animebox_watch.leaderboard_trust_restrictions(user_id,assessed_at)
  values(new.user_id,new.created_at) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function animebox_watch.persist_leaderboard_restriction() from public,anon,authenticated;
create trigger leaderboard_trust_persist after insert on public.product_events
for each row execute function animebox_watch.persist_leaderboard_restriction();

alter table animebox_watch.leaderboard_daily_activity enable row level security;
alter table animebox_watch.leaderboard_coverage enable row level security;
alter table animebox_watch.leaderboard_trust_restrictions enable row level security;
revoke all on animebox_watch.leaderboard_daily_activity,animebox_watch.leaderboard_coverage,animebox_watch.leaderboard_trust_restrictions from public,anon,authenticated;
grant select on animebox_watch.leaderboard_daily_activity,animebox_watch.leaderboard_coverage,animebox_watch.leaderboard_trust_restrictions to service_role;

-- One calculation for live rankings and finalized seasons. UTC-day boundaries only.
create function animebox_watch.leaderboard_period_totals(p_start timestamptz,p_end timestamptz)
returns table(user_id uuid,active_ms bigint,episodes bigint,last_watched_at timestamptz)
language sql stable set search_path='' as $$
 with credited as (
 select d.user_id,d.episode_id,least(sum(d.accepted_ms),coalesce(max(e.duration_ms),14400000))::bigint ms,max(d.last_watched_at) last_at
 from animebox_watch.leaderboard_daily_activity d join animebox_watch.episodes e on e.id=d.episode_id
 where d.activity_date >= (p_start at time zone 'UTC')::date
 and d.activity_date < (p_end at time zone 'UTC')::date
 and not exists(select 1 from animebox_watch.leaderboard_trust_restrictions r where r.user_id=d.user_id and r.assessed_at>=p_start and r.assessed_at<p_end)
 group by d.user_id,d.episode_id
 ), completed as (
 select p.user_id,count(*)::bigint episodes from animebox_watch.progress p
 where completed_at>=p_start and completed_at<p_end group by p.user_id
 )
 select c.user_id,sum(c.ms)::bigint,coalesce(max(p.episodes),0),max(c.last_at)
 from credited c left join completed p on p.user_id=c.user_id
 group by c.user_id having sum(c.ms)>0;
$$;
revoke all on function animebox_watch.leaderboard_period_totals(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function animebox_watch.leaderboard_period_totals(timestamptz,timestamptz) to service_role;

create or replace function animebox_watch.leaderboard(p_period text default 'week',p_limit integer default 100,p_user_id uuid default null)
returns table(rank_no bigint,user_id uuid,username text,avatar_path text,active_ms bigint,episodes bigint,last_watched_at timestamptz,is_current_user boolean)
language sql stable set search_path='' as $$
 with bounds as (
 select (date_trunc(case when p_period='month' then 'month' else 'week' end,now() at time zone 'UTC') at time zone 'UTC') as since,
 ((date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC') as until
 ), totals as (
 select t.* from bounds b cross join lateral animebox_watch.leaderboard_period_totals(b.since,b.until) t where p_period<>'all'
 union all
 select p.user_id,sum(p.active_ms)::bigint,count(*) filter(where p.completed_at is not null)::bigint,max(p.last_watched_at)
 from animebox_watch.progress p where p_period='all' group by p.user_id having sum(p.active_ms)>0
 ), ranked as (
 select row_number() over(order by t.active_ms desc,t.last_watched_at desc nulls last,t.user_id)::bigint rank_no,
 t.user_id,coalesce(nullif(btrim(p.username),''),'Пользователь')::text username,p.avatar_path,t.active_ms,t.episodes,t.last_watched_at
 from totals t join public.profiles p on p.id=t.user_id
 )
 select r.*,coalesce(r.user_id=p_user_id,false) from ranked r
 where r.rank_no<=least(greatest(coalesce(p_limit,100),1),100) or r.user_id=p_user_id order by r.rank_no;
$$;

revoke all on function animebox_watch.leaderboard(text,integer,uuid) from public,anon,authenticated;
grant execute on function animebox_watch.leaderboard(text,integer,uuid) to service_role;

alter table public.leaderboard_seasons add column archive_status text not null default 'legacy'
 check(archive_status in ('legacy','complete','partial'));
alter table public.leaderboard_seasons add column calculation_version text not null default 'heartbeat-v1';
create or replace function public.finalize_leaderboard_season(p_period_type text,p_period_key text,p_starts_at timestamptz,p_ends_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare season_uuid uuid; entry_count integer; coverage_start timestamptz; status text;
begin
 if p_period_type is null or p_period_type not in ('week','month') or p_starts_at is null or p_ends_at is null then raise exception 'INVALID_PERIOD_TYPE'; end if;
 if p_starts_at<>(date_trunc(case when p_period_type='week' then 'week' else 'month' end,p_starts_at at time zone 'UTC') at time zone 'UTC')
 or p_ends_at<>p_starts_at+(case when p_period_type='week' then interval '7 days' else interval '1 month' end)
 or p_ends_at>now()
 or p_period_key<>(case when p_period_type='week' then to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD') else to_char(p_starts_at at time zone 'UTC','YYYY-MM') end)
 or p_period_key is null then raise exception 'INVALID_PERIOD_BOUNDS'; end if;
 perform pg_advisory_xact_lock(hashtextextended('leaderboard:'||p_period_type||':'||p_period_key,0));
 select id,archive_status into season_uuid,status from public.leaderboard_seasons where period_type=p_period_type and period_key=p_period_key;
 if season_uuid is not null then
 return jsonb_build_object('season_id',season_uuid,'created',false,'status',status,'entries',(select count(*) from public.leaderboard_season_entries where season_id=season_uuid));
 end if;
 select covered_from into strict coverage_start from animebox_watch.leaderboard_coverage where singleton;
 status:=case when p_starts_at>=coverage_start then 'complete' else 'partial' end;
 insert into public.leaderboard_seasons(period_type,period_key,starts_at,ends_at,archive_status,calculation_version)
 values(p_period_type,p_period_key,p_starts_at,p_ends_at,status,'durable-periods-v1') returning id into season_uuid;
 if status='partial' then
 return jsonb_build_object('season_id',season_uuid,'created',true,'status',status,'entries',0,'covered_from',coverage_start);
 end if;
 with ranked as (
 select row_number() over(order by t.active_ms desc,t.last_watched_at desc nulls last,t.user_id) place,t.*,p.username,p.avatar_path
 from animebox_watch.leaderboard_period_totals(p_starts_at,p_ends_at)t join public.profiles p on p.id=t.user_id
 )
 insert into public.leaderboard_season_entries(season_id,user_id,place,active_ms,episodes,username_snapshot,avatar_path_snapshot)
 select season_uuid,user_id,place::smallint,active_ms,episodes,coalesce(nullif(btrim(username),''),'Пользователь'),avatar_path from ranked where place<=10;
 get diagnostics entry_count=row_count;
 return jsonb_build_object('season_id',season_uuid,'created',true,'status',status,'entries',entry_count);
end $$;
revoke all on function public.finalize_leaderboard_season(text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_leaderboard_season(text,text,timestamptz,timestamptz) to service_role;

-- Public RPC surface is service-only: no internal restriction reasons exposed.
create function public.leaderboard_data_health(p_period text default 'week')
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('coveredFrom',covered_from,'calculationVersion',calculation_version,'computedAt',now(),'participantCount',case when p_period='all' then (select count(*) from (select p.user_id from animebox_watch.progress p join public.profiles u on u.id=p.user_id group by p.user_id having sum(p.active_ms)>0)t) else (select count(*) from animebox_watch.leaderboard_period_totals((date_trunc(case when p_period='month' then 'month' else 'week' end,now() at time zone 'UTC') at time zone 'UTC'),((date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC'))) end) from animebox_watch.leaderboard_coverage where singleton;
$$;
revoke all on function public.leaderboard_data_health(text) from public,anon,authenticated;
grant execute on function public.leaderboard_data_health(text) to service_role;
-- Retain raw data 60 days during rollout; daily aggregates survive the cleanup.
select cron.schedule('animebox-watch-hot-data-cleanup','23 4 * * *','select public.cleanup_animebox_watch_hot_data(60, 60);');

create function public.leaderboard_archive_preview(p_starts_at timestamptz,p_ends_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare rows jsonb; covered_from timestamptz;
begin
 if p_starts_at is null or p_ends_at is null or p_ends_at>now() or p_starts_at>=p_ends_at
 or not ((p_starts_at=(date_trunc('week',p_starts_at at time zone 'UTC') at time zone 'UTC') and p_ends_at=p_starts_at+interval '7 days')
 or (p_starts_at=(date_trunc('month',p_starts_at at time zone 'UTC') at time zone 'UTC') and p_ends_at=p_starts_at+interval '1 month')) then raise exception 'INVALID_PERIOD_BOUNDS'; end if;
 select c.covered_from into strict covered_from from animebox_watch.leaderboard_coverage c where singleton;
 select coalesce(jsonb_agg(t),'[]'::jsonb) into rows from
 (select row_number()over(order by t.active_ms desc,t.last_watched_at desc nulls last,t.user_id) place,t.user_id,p.username,t.active_ms,t.episodes
 from animebox_watch.leaderboard_period_totals(p_starts_at,p_ends_at)t join public.profiles p on p.id=t.user_id
 order by place limit 10)t;
 return jsonb_build_object('complete',p_starts_at>=covered_from,'coveredFrom',covered_from,'entries',rows,'dryRun',true);
end $$;
revoke all on function public.leaderboard_archive_preview(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.leaderboard_archive_preview(timestamptz,timestamptz) to service_role;
