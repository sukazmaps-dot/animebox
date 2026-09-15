begin;

-- =========================================================
-- 1. Привязка комментария к конкретной серии
-- =========================================================

alter table public.comments
add column if not exists episode_number integer;

alter table public.comments
drop constraint if exists comments_episode_number_check;

alter table public.comments
add constraint comments_episode_number_check
check (
  episode_number is null
  or episode_number > 0
);

-- Старые комментарии тайтла оставляем в БД,
-- но новый API их просто не показывает.
-- Поэтому сейчас НЕ делаем SET NOT NULL.

-- =========================================================
-- 2. Индексы
-- =========================================================

create index if not exists comments_episode_lookup_idx
on public.comments (
  anime_id,
  episode_number,
  created_at desc
)
where episode_number is not null;

create index if not exists comments_parent_episode_idx
on public.comments (
  parent_id,
  created_at asc
)
where parent_id is not null;

-- =========================================================
-- 3. Создание комментария под эпизодом
-- =========================================================

create or replace function public.create_episode_comment(
  p_anime bigint,
  p_episode integer,
  p_body text,
  p_spoiler boolean default false,
  p_parent uuid default null,
  p_request uuid default gen_random_uuid()
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_body text := btrim(p_body);
  parent_comment public.comments;
  new_depth integer := 0;
  created_comment public.comments;
begin

  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_anime is null or p_anime <= 0 then
    raise exception 'INVALID_ANIME';
  end if;

  if p_episode is null or p_episode <= 0 then
    raise exception 'INVALID_EPISODE';
  end if;

  if clean_body is null or length(clean_body) = 0 then
    raise exception 'EMPTY_COMMENT';
  end if;

  if char_length(clean_body) > 4000 then
    raise exception 'COMMENT_TOO_LONG';
  end if;

  -- Защита от спама.
  if exists (
    select 1
    from public.comments
    where user_id = uid
      and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'RATE_LIMIT';
  end if;

  -- =======================================================
  -- Ответ на комментарий
  -- =======================================================

  if p_parent is not null then

    select *
    into parent_comment
    from public.comments
    where id = p_parent;

    if parent_comment.id is null then
      raise exception 'PARENT_NOT_FOUND';
    end if;

    -- Нельзя ответить комментарию другой серии.
    if parent_comment.anime_id <> p_anime
       or parent_comment.episode_number <> p_episode then
      raise exception 'INVALID_PARENT_EPISODE';
    end if;

    new_depth := parent_comment.depth + 1;

    -- Не даём бесконечно углублять дерево.
    if new_depth > 5 then
      raise exception 'MAX_DEPTH';
    end if;

  end if;

  insert into public.comments (
    anime_id,
    episode_number,
    user_id,
    parent_id,
    depth,
    body,
    is_spoiler,
    request_id
  )
  values (
    p_anime,
    p_episode,
    uid,
    p_parent,
    new_depth,
    clean_body,
    coalesce(p_spoiler, false),
    p_request
  )
  returning *
  into created_comment;

  return created_comment;

end;
$$;

revoke all
on function public.create_episode_comment(
  bigint,
  integer,
  text,
  boolean,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.create_episode_comment(
  bigint,
  integer,
  text,
  boolean,
  uuid,
  uuid
)
to authenticated;

commit;