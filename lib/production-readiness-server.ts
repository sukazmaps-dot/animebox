import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type OperationalPruneSummary = {
  systemJobRuns: number;
  systemIncidents: number;
  systemRequestMetrics: number;
  productEvents: number;
  runtimeRefreshLeases: number;
};

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export async function pruneOperationalData(input: {
  jobRetentionDays?: number;
  incidentRetentionDays?: number;
  requestRetentionDays?: number;
  eventRetentionDays?: number;
  leaseRetentionHours?: number;
} = {}): Promise<OperationalPruneSummary> {
  const { data, error } = await createSupabaseAdmin().rpc(
    'prune_animebox_operational_data',
    {
      p_job_retention_days: input.jobRetentionDays ?? 30,
      p_incident_retention_days: input.incidentRetentionDays ?? 30,
      p_request_retention_days: input.requestRetentionDays ?? 30,
      p_event_retention_days: input.eventRetentionDays ?? 180,
      p_lease_retention_hours: input.leaseRetentionHours ?? 24,
    },
  );

  if (error) throw error;

  const row =
    data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};

  return {
    systemJobRuns: finite(row.system_job_runs),
    systemIncidents: finite(row.system_incidents),
    systemRequestMetrics: finite(row.system_request_metrics),
    productEvents: finite(row.product_events),
    runtimeRefreshLeases: finite(row.runtime_refresh_leases),
  };
}
