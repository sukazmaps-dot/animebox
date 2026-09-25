import 'server-only';

import { after } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { reportSystemIncident } from '@/lib/system-observability-server';

const SUCCESS_SAMPLE_RATE = 8;
const SLOW_REQUEST_MS = 1_500;

type RouteHandler<TRequest extends Request, TArgs extends unknown[]> = (
  request: TRequest,
  ...args: TArgs
) => Response | Promise<Response>;

function requestIdFrom(request: Request) {
  const value = request.headers.get('x-animebox-request-id')?.trim();
  return value ? value.slice(0, 80) : crypto.randomUUID();
}

function safeRouteKey(routeKey: string) {
  const value = routeKey.trim().toLowerCase().slice(0, 120);
  return value.startsWith('/api/') ? value : '/api/unknown';
}

function safeMethod(method: string) {
  const value = method.toUpperCase();
  return ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(value)
    ? value
    : 'GET';
}

function sampledSuccess(requestId: string) {
  let hash = 0;
  for (let index = 0; index < requestId.length; index += 1) {
    hash = ((hash * 33) ^ requestId.charCodeAt(index)) >>> 0;
  }
  return hash % SUCCESS_SAMPLE_RATE === 0;
}

function exceptionCode(error: unknown) {
  const name = error instanceof Error ? error.name : 'unknown_error';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown_error';
}

async function persistMetric(input: {
  routeKey: string;
  method: string;
  requestId: string;
  statusCode: number;
  durationMs: number;
}) {
  const alwaysRecord =
    input.statusCode >= 500 ||
    input.statusCode === 429 ||
    input.durationMs >= SLOW_REQUEST_MS;

  if (!alwaysRecord && !sampledSuccess(input.requestId)) return;

  const weight = alwaysRecord ? 1 : SUCCESS_SAMPLE_RATE;

  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.rpc('record_system_request_metric', {
      p_route_key: safeRouteKey(input.routeKey),
      p_method: safeMethod(input.method),
      p_weight: weight,
      p_status_code: Math.max(100, Math.min(599, Math.round(input.statusCode))),
      p_duration_ms: Math.max(0, Math.min(120_000, Math.round(input.durationMs))),
    });

    if (error) throw error;
  } catch (error) {
    // Request telemetry is deliberately fail-open.
    console.warn('[Request observability] metric unavailable', {
      routeKey: input.routeKey,
      statusCode: input.statusCode,
      error,
    });
  }
}

async function persistUnhandledIncident(input: {
  routeKey: string;
  method: string;
  requestId: string;
  durationMs: number;
  error: unknown;
}) {
  await reportSystemIncident({
    fingerprint: `request:${safeRouteKey(input.routeKey)}:unhandled`,
    service: 'api-runtime',
    severity: 'critical',
    title: `${safeRouteKey(input.routeKey)} завершился необработанной ошибкой`,
    message: exceptionCode(input.error),
    metadata: {
      requestId: input.requestId,
      method: safeMethod(input.method),
      durationMs: Math.round(input.durationMs),
      errorCode: exceptionCode(input.error),
    },
  });
}

export async function pruneSystemRequestMetrics(retentionDays = 30) {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc('prune_system_request_metrics', {
      p_retention_days: Math.max(7, Math.min(90, Math.round(retentionDays))),
    });

    if (error) throw error;
    return Math.max(0, Number(data ?? 0));
  } catch (error) {
    console.warn('[Request observability] prune unavailable', error);
    return 0;
  }
}

export function observeApiRoute<
  TRequest extends Request,
  TArgs extends unknown[],
>(
  routeKey: string,
  handler: RouteHandler<TRequest, TArgs>,
) {
  const normalizedRouteKey = safeRouteKey(routeKey);

  return async (
    request: TRequest,
    ...args: TArgs
  ): Promise<Response> => {
    const startedAt = performance.now();
    const requestId = requestIdFrom(request);

    try {
      const response = await handler(request, ...args);
      const durationMs = Math.max(0, performance.now() - startedAt);

      after(async () => {
        await persistMetric({
          routeKey: normalizedRouteKey,
          method: request.method,
          requestId,
          statusCode: response.status,
          durationMs,
        });
      });

      return response;
    } catch (error) {
      const durationMs = Math.max(0, performance.now() - startedAt);

      after(async () => {
        await Promise.all([
          persistMetric({
            routeKey: normalizedRouteKey,
            method: request.method,
            requestId,
            statusCode: 500,
            durationMs,
          }),
          persistUnhandledIncident({
            routeKey: normalizedRouteKey,
            method: request.method,
            requestId,
            durationMs,
            error,
          }),
        ]);
      });

      throw error;
    }
  };
}
