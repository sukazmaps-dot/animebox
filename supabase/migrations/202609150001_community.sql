-- Execute once in Supabase SQL Editor. Existing profiles/user_anime are preserved.
begin;
-- Supabase auth.users is the users table; passwords stay managed by Supabase Auth.
create table public.anime_catalog (
 id bigint primary key check (id > 0), title text not null,
 total_episodes integer check (total_episodes > 0), finished boolean not null default false,
 genres text[] not null default '{}', updated_at timestamptz not null default now()
);
create table public.anime_library (
 user_id uuid references auth.users(id) on delete cascade,
 anime_id bigint references public.anime_catalog(id),
 status text not null check (status in ('watching','planned','completed','dropped')),
 updated_at timestamptz not null default now(), primary key(user_id, anime_id)
);
create table public.episodes_history (
 user_id uuid references auth.users(id) on delete cascade,
 anime_id bigint references public.anime_catalog(id), episode_number integer check(episode_number between 1 and 100000),
 completed boolean not null default false,
 completion_source text check(completion_source in ('manual','player')),
 completed_at timestamptz, primary key(user_id, anime_id, episode_number),
 check ((completed and completed_at is not null and completion_source is not null)
   or (not completed and completed_at is null and completion_source is null))
);
create index episodes_completed_user on public.episodes_history(user_id,anime_id) where completed;
create table public.achievements (
 code text primary key, title text not null, description text not null,
 metric text not null check(metric in ('episodes','shonen_titles','comments')),
 threshold integer not null check(threshold>0), icon text not null
);
create table public.user_achievements (
 user_id uuid references auth.users(id) on delete cascade,
 achievement_code text references public.achievements(code), earned_at timestamptz not null default now(),
 primary key(user_id,achievement_code)
);
create table public.comments (
 id uuid primary key default gen_random_uuid(), anime_id bigint not null references public.anime_catalog(id),
 user_id uuid references auth.users(id) on delete set null,
 parent_id uuid, depth integer not null default 0 check(depth between 0 and 8),
 body text not null check(char_length(btrim(body)) between 1 and 4000),
 is_spoiler boolean not null, created_at timestamptz not null default now(),
 request_id uuid not null, unique(user_id,request_id), unique(id,anime_id),
 foreign key(parent_id,anime_id) references public.comments(id,anime_id)
);
create index comments_thread on public.comments(anime_id,parent_id,created_at,id);
create index comments_user_time on public.comments(user_id,created_at desc);
insert into public.achievements values
 ('episodes_100','Марафонец','Посмотри 100 уникальных серий','episodes',100,'/ui/animebox-rank-2.webp'),
 ('shonen_10','Путь героя','Заверши 10 тайтлов Сёнен','shonen_titles',10,'/ui/animebox-rank-3.webp'),
 ('first_comment','Есть что сказать','Оставь первый комментарий','comments',1,'/ui/animebox-rank-1.webp');

-- Private helper. A finished title requires every episode, not a manually chosen list status.
create function public.community_metrics(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 with completed_titles as (
  select a.id,a.genres from public.anime_catalog a
  join public.episodes_history h on h.anime_id=a.id and h.user_id=p_user and h.completed
  where a.finished and a.total_episodes is not null and h.episode_number<=a.total_episodes
  group by a.id having count(*)=a.total_episodes
 )
 select jsonb_build_object(
 'episodes',(select count(*) from public.episodes_history where user_id=p_user and completed),
 'titles',(select count(*) from completed_titles),
 'minutes',(select count(*)*24 from public.episodes_history where user_id=p_user and completed),
 'shonen_titles',(select count(*) from completed_titles where genres && array['Shounen','Shonen','Сёнен','Сенен']),
 'comments',(select count(*) from public.comments where user_id=p_user),
 'watching',(select count(*) from public.anime_library where user_id=p_user and status='watching'),
 'planned',(select count(*) from public.anime_library where user_id=p_user and status='planned'),
 'completed',(select count(*) from public.anime_library where user_id=p_user and status='completed'),
 'dropped',(select count(*) from public.anime_library where user_id=p_user and status='dropped'));
$$;
create function public.award_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare metrics jsonb;
begin
 metrics:=public.community_metrics(p_user);
 insert into public.user_achievements(user_id,achievement_code)
 select p_user,code from public.achievements where (metrics->>metric)::bigint>=threshold
 on conflict do nothing;
end $$;

-- All user mutations serialize on the same lock. RPC uses the authenticated identity only.
create function public.record_episode(p_anime bigint,p_episode integer,p_completed boolean,p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); total integer;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_episode is null or p_episode not between 1 and 100000 or p_completed is null
 or p_source is null or p_source not in ('manual','player') then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select total_episodes into total from public.anime_catalog where id=p_anime;
 if not found then raise exception 'ANIME_NOT_FOUND'; end if;
 if total is not null and p_episode>total then raise exception 'INVALID_EPISODE'; end if;
 insert into public.episodes_history(user_id,anime_id,episode_number,completed,completion_source,completed_at)
 values(uid,p_anime,p_episode,p_completed,case when p_completed then p_source end,case when p_completed then now() end)
 on conflict(user_id,anime_id,episode_number) do update set
 completed=excluded.completed,completion_source=excluded.completion_source,completed_at=
 case when excluded.completed then coalesce(episodes_history.completed_at,excluded.completed_at) end;
 insert into public.anime_library values(uid,p_anime,'watching',now()) on conflict do nothing;
 perform public.award_achievements(uid);
end $$;
create function public.set_library_status(p_anime bigint,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_status is null or p_status not in ('watching','planned','completed','dropped') then raise exception 'INVALID_STATUS'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 insert into public.anime_library values(uid,p_anime,p_status,now())
 on conflict(user_id,anime_id) do update set status=excluded.status,updated_at=now();
end $$;
create function public.create_comment(p_anime bigint,p_body text,p_spoiler boolean,p_parent uuid,p_request uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); result uuid; parent_depth integer:= -1;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 or p_spoiler is null or p_request is null then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select id into result from public.comments where user_id=uid and request_id=p_request;
 if found then return result; end if;
 if exists(select 1 from public.comments where user_id=uid and created_at>now()-interval '10 seconds') then raise exception 'RATE_LIMIT'; end if;
 if p_parent is not null then
  select depth into parent_depth from public.comments where id=p_parent and anime_id=p_anime;
  if not found then raise exception 'INVALID_PARENT'; end if;
  if parent_depth>=8 then raise exception 'MAX_DEPTH'; end if;
 end if;
 insert into public.comments(anime_id,user_id,parent_id,depth,body,is_spoiler,request_id)
 values(p_anime,uid,p_parent,parent_depth+1,btrim(p_body),p_spoiler,p_request) returning id into result;
 perform public.award_achievements(uid);
 return result;
end $$;
create function public.my_community_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform public.award_achievements(uid);
 select jsonb_build_object('stats',public.community_metrics(uid),
 'achievements',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('earned_at',u.earned_at) order by a.code),'[]'::jsonb)
 from public.achievements a left join public.user_achievements u on u.achievement_code=a.code and u.user_id=uid),
 'library',(select coalesce(jsonb_agg(jsonb_build_object('anime_id',l.anime_id,'title',a.title,'status',l.status) order by l.updated_at desc),'[]'::jsonb)
 from public.anime_library l join public.anime_catalog a on a.id=l.anime_id where user_id=uid)) into result;
 return result;
end $$;

create function public.my_completed_episodes(p_anime bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(episode_number order by episode_number),'[]'::jsonb)
 from public.episodes_history where user_id=auth.uid() and anime_id=p_anime and completed;
$$;
revoke all on function public.my_completed_episodes(bigint) from public,anon;
grant execute on function public.my_completed_episodes(bigint) to authenticated;
alter table public.anime_catalog enable row level security;
alter table public.anime_library enable row level security;
alter table public.episodes_history enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.comments enable row level security;
create policy catalog_read on public.anime_catalog for select using(true);
create policy achievement_read on public.achievements for select using(true);
create policy comment_read on public.comments for select using(true);
create policy library_self on public.anime_library for select using(user_id=(select auth.uid()));
create policy history_self on public.episodes_history for select using(user_id=(select auth.uid()));
create policy awards_self on public.user_achievements for select using(user_id=(select auth.uid()));
revoke all on public.anime_catalog,public.anime_library,public.episodes_history,public.achievements,public.user_achievements,public.comments from anon,authenticated;
grant select on public.anime_catalog,public.achievements,public.comments to anon,authenticated;
grant select on public.anime_library,public.episodes_history,public.user_achievements to authenticated;
grant all on public.anime_catalog,public.anime_library,public.episodes_history,public.achievements,public.user_achievements,public.comments to service_role;
revoke all on function public.community_metrics(uuid),public.award_achievements(uuid),public.record_episode(bigint,integer,boolean,text),public.set_library_status(bigint,text),public.create_comment(bigint,text,boolean,uuid,uuid),public.my_community_profile() from public,anon,authenticated;
grant execute on function public.record_episode(bigint,integer,boolean,text),public.set_library_status(bigint,text),public.create_comment(bigint,text,boolean,uuid,uuid),public.my_community_profile() to authenticated;
commit;
