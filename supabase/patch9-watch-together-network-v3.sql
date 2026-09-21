-- AnimeBox Patch 9 · Watch Together Network v3
-- Raise room capacity for Realtime-first rooms while keeping P2P fan-out capped
-- in the client. Video traffic never passes through AnimeBox room transport.

alter table public.watch_party_rooms
  drop constraint if exists watch_party_rooms_participant_count_check,
  drop constraint if exists watch_party_rooms_max_participants_check;

alter table public.watch_party_rooms
  add constraint watch_party_rooms_participant_count_check
    check (participant_count between 0 and 50),
  add constraint watch_party_rooms_max_participants_check
    check (max_participants between 2 and 50);

alter table public.watch_party_rooms
  alter column max_participants set default 50;

update public.watch_party_rooms
set max_participants = 50
where status <> 'ended' and max_participants < 50;
