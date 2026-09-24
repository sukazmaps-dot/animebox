import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type SystemJobStatus =
  | 'succeeded'
  | 'degraded'
  | 'failed'
  | 'skipped';

export type IncidentSeverity = 'warning' | 'critical';

function safeMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1_000);
  return String(error ?? 'unknown_error').slice(0, 1_000);
}

function safeErrorCode(error: unknown, fallback = 'unknown_error') {
  const raw =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  const candidate = raw || safeMessage(error) || fallback;
  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || fallback;
}

function compactSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, 40)
    .map(([key, item]) => {
      if (
        item == null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
      ) {
        return [key.slice(0, 80), item] as const;
      }

      if (Array.isArray(item)) {
        return [
          key.slice(0, 80),
          {
            kind: 'array',
            length: item.length,
          },
        ] as const;
      }

      return [key.slice(0, 80), { kind: 'object' }] as const;
    });

  return Object.fromEntries(entries);
}

export async function recordSystemJobRun(input: {
  jobKey: string;
  status: SystemJobStatus;
  startedAt: number;
  errorCode?: string | null;
  summary?: unknown;
}) {
  const finishedAt = Date.now();

  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from('system_job_runs').insert({
      job_key: input.jobKey,
      status: input.status,
      started_at: new Date(input.startedAt).toISOString(),
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: Math.max(0, finishedAt - input.startedAt),
      error_code: input.errorCode?.slice(0, 160) || null,
      summary: compactSummary(input.summary),
    });

    if (error) throw error;
  } catch (error) {
    // Observability is fail-open: a telemetry outage must never break the job.
    console.warn('[System observability] job journal unavailable', {
      jobKey: input.jobKey,
      error,
    });
  }
}

export async function reportSystemIncident(input: {
  fingerprint: string;
  service: string;
  severity: IncidentSeverity;
  title: string;
  message?: string | null;
  metadata?: unknown;
}) {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.rpc('report_system_incident', {
      p_fingerprint: input.fingerprint.slice(0, 160),
      p_service: input.service.slice(0, 80),
      p_severity: input.severity,
      p_title: input.title.slice(0, 180),
      p_message: input.message?.slice(0, 1_000) || null,
      p_metadata: compactSummary(input.metadata),
    });

    if (error) throw error;
  } catch (error) {
    console.warn('[System observability] incident report unavailable', {
      fingerprint: input.fingerprint,
      error,
    });
  }
}

export async function resolveSystemIncident(fingerprint: string) {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.rpc('resolve_system_incident', {
      p_fingerprint: fingerprint.slice(0, 160),
    });

    if (error) throw error;
  } catch (error) {
    console.warn('[System observability] incident resolve unavailable', {
      fingerprint,
      error,
    });
  }
}

export function createSystemJobObserver(jobKey: string, options?: {
  service?: string;
  failureSeverity?: IncidentSeverity;
}) {
  const startedAt = Date.now();
  const service = options?.service ?? 'cron';
  const fingerprint = `job:${jobKey}`;

  return {
    startedAt,

    async success(summary?: unknown) {
      await Promise.all([
        recordSystemJobRun({
          jobKey,
          status: 'succeeded',
          startedAt,
          summary,
        }),
        resolveSystemIncident(fingerprint),
      ]);
    },

    async degraded(errorCode: string, summary?: unknown) {
      await Promise.all([
        recordSystemJobRun({
          jobKey,
          status: 'degraded',
          startedAt,
          errorCode,
          summary,
        }),
        reportSystemIncident({
          fingerprint,
          service,
          severity: 'warning',
          title: `${jobKey} работает с деградацией`,
          message: errorCode,
          metadata: summary,
        }),
      ]);
    },

    async skipped(errorCode: string, summary?: unknown) {
      await recordSystemJobRun({
        jobKey,
        status: 'skipped',
        startedAt,
        errorCode,
        summary,
      });
    },

    async failed(error: unknown, summary?: unknown) {
      const errorCode = safeErrorCode(error);

      await Promise.all([
        recordSystemJobRun({
          jobKey,
          status: 'failed',
          startedAt,
          errorCode,
          summary,
        }),
        reportSystemIncident({
          fingerprint,
          service,
          severity: options?.failureSeverity ?? 'critical',
          title: `${jobKey} завершился ошибкой`,
          message: safeMessage(error),
          metadata: {
            errorCode,
            ...compactSummary(summary),
          },
        }),
      ]);

      return errorCode;
    },
  };
}
