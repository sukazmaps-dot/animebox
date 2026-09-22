export type FunnelEvent = {
  event_name: string;
  session_id: string | null;
  created_at: string;
};

/** Count each session once per step, only after all preceding steps occurred.
 * Equal timestamps are treated as a batch: ingestion order is not event order.
 */
export function orderedFunnelCounts(rows: readonly FunnelEvent[], steps: readonly string[]): number[] {
  const counts = steps.map(() => 0);
  const sessions = new Map<string, Map<number, Set<string>>>();
  for (const row of rows) {
    const time = Date.parse(row.created_at);
    if (!row.session_id || !Number.isFinite(time)) continue;
    let timeline = sessions.get(row.session_id);
    if (!timeline) { timeline = new Map(); sessions.set(row.session_id, timeline); }
    let events = timeline.get(time);
    if (!events) { events = new Set(); timeline.set(time, events); }
    events.add(row.event_name);
  }
  for (const timeline of sessions.values()) {
    let step = 0;
    for (const [, events] of [...timeline].sort(([a], [b]) => a - b)) {
      while (step < steps.length && events.has(steps[step])) counts[step++]++;
    }
  }
  return counts;
}
