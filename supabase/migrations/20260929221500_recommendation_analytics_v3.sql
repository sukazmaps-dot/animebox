-- Patch 22 Phase K — Recommendation Analytics 3.0
-- The dashboard scans recommendation events by event_name and time range.
-- Keep attribution in product_events; no parallel analytics table is created.

create index if not exists product_events_recommendation_analytics_v3_idx
  on public.product_events(event_name, created_at desc)
  include (
    recommendation_id,
    recommendation_session_id,
    algorithm_version,
    source,
    entity_id
  );

comment on index public.product_events_recommendation_analytics_v3_idx is
  'Patch 22 Phase K: supports bounded recommendation funnel scans by event type and time.';
