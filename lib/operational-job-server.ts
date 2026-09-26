import 'server-only';

import {
  releaseRuntimeRefreshLease,
  tryAcquireRuntimeRefreshLease,
} from '@/lib/runtime-refresh-lease-server';
import { getRuntimeControlSnapshot } from '@/lib/runtime-controls-server';

export type OperationalJobSkipReason =
  | 'background_jobs_disabled'
  | 'brownout'
  | 'already_running';

export type OperationalJobPermit =
  | {
      allowed: false;
      reason: OperationalJobSkipReason;
      degraded: boolean;
      startedAt: number;
      deadlineAt: number;
      remainingMs: () => number;
      shouldStop: (reserveMs?: number) => boolean;
      release: () => Promise<void>;
    }
  | {
      allowed: true;
      reason: null;
      degraded: boolean;
      startedAt: number;
      deadlineAt: number;
      remainingMs: () => number;
      shouldStop: (reserveMs?: number) => boolean;
      release: () => Promise<void>;
    };

const DEFAULT_BUDGET_MS = 50_000;
const MIN_BUDGET_MS = 10_000;
const MAX_BUDGET_MS = 55_000;

function normalizeBudgetMs(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_BUDGET_MS;
  return Math.max(
    MIN_BUDGET_MS,
    Math.min(MAX_BUDGET_MS, Math.round(value as number)),
  );
}

function permitShell(input: {
  allowed: boolean;
  reason: OperationalJobSkipReason | null;
  degraded: boolean;
  startedAt: number;
  deadlineAt: number;
  release: () => Promise<void>;
}): OperationalJobPermit {
  const remainingMs = () => Math.max(0, input.deadlineAt - Date.now());
  const shouldStop = (reserveMs = 3_000) =>
    remainingMs() <= Math.max(0, Math.round(reserveMs));

  return {
    allowed: input.allowed,
    reason: input.reason,
    degraded: input.degraded,
    startedAt: input.startedAt,
    deadlineAt: input.deadlineAt,
    remainingMs,
    shouldStop,
    release: input.release,
  } as OperationalJobPermit;
}

export async function beginOperationalJob(
  jobKey: string,
  options: {
    budgetMs?: number;
    leaseTtlSeconds?: number;
    allowDuringBrownout?: boolean;
  } = {},
): Promise<OperationalJobPermit> {
  const startedAt = Date.now();
  const budgetMs = normalizeBudgetMs(options.budgetMs);
  const deadlineAt = startedAt + budgetMs;
  const controls = await getRuntimeControlSnapshot();

  if (!controls.features.background_jobs) {
    return permitShell({
      allowed: false,
      reason: 'background_jobs_disabled',
      degraded: controls.degraded,
      startedAt,
      deadlineAt,
      release: async () => undefined,
    });
  }

  if (
    controls.mode === 'brownout' &&
    options.allowDuringBrownout !== true
  ) {
    return permitShell({
      allowed: false,
      reason: 'brownout',
      degraded: controls.degraded,
      startedAt,
      deadlineAt,
      release: async () => undefined,
    });
  }

  const lease = await tryAcquireRuntimeRefreshLease(
    'system_job',
    jobKey,
    options.leaseTtlSeconds ?? 90,
  );

  if (!lease.acquired) {
    return permitShell({
      allowed: false,
      reason: 'already_running',
      degraded: lease.degraded || controls.degraded,
      startedAt,
      deadlineAt,
      release: async () => undefined,
    });
  }

  let released = false;

  return permitShell({
    allowed: true,
    reason: null,
    degraded: lease.degraded || controls.degraded,
    startedAt,
    deadlineAt,
    release: async () => {
      if (released) return;
      released = true;
      await releaseRuntimeRefreshLease(
        'system_job',
        jobKey,
        lease.ownerToken,
      );
    },
  });
}
