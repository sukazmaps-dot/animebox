-- Patch 18.5.3.1 — Copyright Takedown Shield
-- Support truthful imports of notices received through Google/Lumen/hosts
-- without inventing claimant contact fields. Direct AnimeBox reports keep
-- their strict shape through the source-specific check below.

alter table public.copyright_cases
  add column if not exists source_type text;

alter table public.copyright_cases
  add column if not exists external_reference text;

alter table public.copyright_cases
  add column if not exists source_url text;

update public.copyright_cases
set source_type = 'direct_notice'
where source_type is null;

alter table public.copyright_cases
  alter column source_type set default 'direct_notice';

alter table public.copyright_cases
  alter column source_type set not null;

alter table public.copyright_cases
  alter column claimant_name drop not null;

alter table public.copyright_cases
  alter column claimant_email drop not null;

alter table public.copyright_cases
  alter column claimant_role drop not null;

alter table public.copyright_cases
  alter column rights_description drop not null;

alter table public.copyright_cases
  alter column authority_statement drop not null;

alter table public.copyright_cases
  alter column signature drop not null;

alter table public.copyright_cases
  drop constraint if exists copyright_cases_source_type_check;

alter table public.copyright_cases
  add constraint copyright_cases_source_type_check
  check (source_type in ('direct_notice', 'external_platform'));

alter table public.copyright_cases
  drop constraint if exists copyright_cases_source_shape;

alter table public.copyright_cases
  add constraint copyright_cases_source_shape
  check (
    (
      source_type = 'direct_notice'
      and nullif(btrim(claimant_name), '') is not null
      and nullif(btrim(claimant_email), '') is not null
      and claimant_role in ('rights_holder', 'authorized_agent', 'other')
      and nullif(btrim(rights_description), '') is not null
      and nullif(btrim(authority_statement), '') is not null
      and nullif(btrim(signature), '') is not null
    )
    or
    (
      source_type = 'external_platform'
      and nullif(btrim(external_reference), '') is not null
    )
  );

alter table public.copyright_cases
  drop constraint if exists copyright_cases_source_url_check;

alter table public.copyright_cases
  add constraint copyright_cases_source_url_check
  check (
    source_url is null
    or source_url ~* '^https?://'
  );

create index if not exists copyright_cases_source_reference_idx
  on public.copyright_cases(source_type, external_reference)
  where external_reference is not null;

comment on column public.copyright_cases.source_type is
  'How AnimeBox received the notice: direct form or an external intermediary such as Google/Lumen/host.';

comment on column public.copyright_cases.external_reference is
  'External notice/reference identifier. Required for external_platform cases.';

comment on column public.copyright_cases.source_url is
  'Optional HTTP(S) source URL for the external notice.';
