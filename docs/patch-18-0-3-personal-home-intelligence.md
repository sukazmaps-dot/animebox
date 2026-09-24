# AnimeBox 18.0.3 — Personal Home Intelligence

## Personal rail ordering

Card ownership is still allocated in the same stable order, so already visible
titles do not jump between rails when Taste Graph data changes. Only the final
rail presentation order is personalized.

Rules:
- an active mood rail is always first;
- Top Match remains the primary exploitation rail;
- confident Taste Graph users see the taste rail earlier;
- high explorationRate promotes Explore above Quick Watch;
- a short preferred episode count promotes Quick Watch;
- cold start deliberately surfaces Explore before taste-derived rails;
- Endless always remains the final continuation rail.

This is a presentation policy, not a ranking-model version bump. Recommendation
algorithm attribution therefore remains 17.8-v1 until scoring weights change.

## Rail health telemetry

The Smart Feed now emits:
- recommendation_rail_end_reached
- recommendation_rail_load_result
- recommendation_rail_load_error

Load result metadata contains row id, previous item count, target depth,
claimed cards, pages scanned, has-more and exhaustion state.

Recommendation analytics separates rail-health events from card attribution so
the new operational events do not dilute recommendation ID/session/version
coverage percentages.

The admin Recommendations dashboard now shows per-rail:
- end reached count
- load requests
- cards added
- successful fill rate
- load errors

## Database

No migration is required. Rail health uses the existing product_events table
and JSON metadata contract.
