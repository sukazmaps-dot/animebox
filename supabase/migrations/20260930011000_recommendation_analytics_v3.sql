-- Patch 22 Phase K — Recommendation Analytics 3.0
-- Supports bounded admin funnel queries over recommendation product events.

create index if not exists product_events_event_created_idx
  on public.product_events(event_name, created_at desc);

create index if not exists product_events_recommendation_event_created_idx
  on public.product_events(recommendation_id, event_name, created_at desc)
  where recommendation_id is not null;

comment on index public.product_events_event_created_idx is
  'Patch 22 Phase K: event-name + time access path for bounded product analytics windows.';

comment on index public.product_events_recommendation_event_created_idx is
  'Patch 22 Phase K: exposure funnel attribution by recommendation id and event stage.';
