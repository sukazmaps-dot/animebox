import 'server-only';

export type UpstreamKey =
  | 'anilist'
  | 'shikimori'
  | 'kodik'
  | 'aniliberty'
  | 'direct';

type UpstreamBudgetConfig = {
  concurrency: number;
  maxQueue: number;
  queueTimeoutMs: number;
  failureThreshold: number;
  openMs: number;
};

type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  signal?: AbortSignal;
  abortListener?: () => void;
};

type UpstreamRuntimeState = {
  active: number;
  queue: Waiter[];
  consecutiveFailures: number;
  openUntil: number;
  halfOpenInFlight: boolean;
  accepted: number;
  rejected: number;
  circuitOpened: number;
};

export type UpstreamRuntimeSnapshot = {
  key: UpstreamKey;
  active: number;
  queued: number;
  concurrency: number;
  maxQueue: number;
  consecutiveFailures: number;
  circuit: 'closed' | 'open' | 'half-open';
  openUntil: string | null;
  accepted: number;
  rejected: number;
  circuitOpened: number;
};

export class UpstreamPressureError extends Error {
  constructor(
    public readonly upstream: UpstreamKey,
    public readonly reason:
      | 'queue_full'
      | 'queue_timeout'
      | 'circuit_open'
      | 'aborted',
  ) {
    super(`${upstream} upstream pressure: ${reason}`);
    this.name = 'UpstreamPressureError';
  }
}

const CONFIG: Record<UpstreamKey, UpstreamBudgetConfig> = {
  anilist: {
    concurrency: 6,
    maxQueue: 36,
    queueTimeoutMs: 450,
    failureThreshold: 4,
    openMs: 12_000,
  },
  shikimori: {
    concurrency: 5,
    maxQueue: 30,
    queueTimeoutMs: 450,
    failureThreshold: 4,
    openMs: 18_000,
  },
  kodik: {
    concurrency: 8,
    maxQueue: 40,
    queueTimeoutMs: 300,
    failureThreshold: 4,
    openMs: 10_000,
  },
  aniliberty: {
    concurrency: 5,
    maxQueue: 28,
    queueTimeoutMs: 350,
    failureThreshold: 4,
    openMs: 15_000,
  },
  direct: {
    concurrency: 4,
    maxQueue: 20,
    queueTimeoutMs: 250,
    failureThreshold: 3,
    openMs: 15_000,
  },
};

const runtime = new Map<UpstreamKey, UpstreamRuntimeState>();

function stateFor(key: UpstreamKey) {
  let state = runtime.get(key);
  if (!state) {
    state = {
      active: 0,
      queue: [],
      consecutiveFailures: 0,
      openUntil: 0,
      halfOpenInFlight: false,
      accepted: 0,
      rejected: 0,
      circuitOpened: 0,
    };
    runtime.set(key, state);
  }
  return state;
}

function removeWaiter(state: UpstreamRuntimeState, waiter: Waiter) {
  const index = state.queue.indexOf(waiter);
  if (index >= 0) state.queue.splice(index, 1);
  if (waiter.timer) clearTimeout(waiter.timer);
  if (waiter.signal && waiter.abortListener) {
    waiter.signal.removeEventListener('abort', waiter.abortListener);
  }
}

function wakeNext(key: UpstreamKey) {
  const state = stateFor(key);
  const next = state.queue.shift();
  if (!next) return;

  if (next.timer) clearTimeout(next.timer);
  if (next.signal && next.abortListener) {
    next.signal.removeEventListener('abort', next.abortListener);
  }

  next.resolve();
}

async function acquireSlot(key: UpstreamKey, signal?: AbortSignal) {
  const config = CONFIG[key];
  const state = stateFor(key);

  if (signal?.aborted) {
    state.rejected += 1;
    throw new UpstreamPressureError(key, 'aborted');
  }

  if (state.active < config.concurrency) {
    state.active += 1;
    state.accepted += 1;
    return;
  }

  if (state.queue.length >= config.maxQueue) {
    state.rejected += 1;
    throw new UpstreamPressureError(key, 'queue_full');
  }

  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve: () => {
        state.active += 1;
        state.accepted += 1;
        resolve();
      },
      reject,
      timer: null,
      signal,
    };

    waiter.timer = setTimeout(() => {
      removeWaiter(state, waiter);
      state.rejected += 1;
      reject(new UpstreamPressureError(key, 'queue_timeout'));
    }, config.queueTimeoutMs);

    if (signal) {
      waiter.abortListener = () => {
        removeWaiter(state, waiter);
        state.rejected += 1;
        reject(new UpstreamPressureError(key, 'aborted'));
      };
      signal.addEventListener('abort', waiter.abortListener, { once: true });
    }

    state.queue.push(waiter);
  });
}

function releaseSlot(key: UpstreamKey) {
  const state = stateFor(key);
  state.active = Math.max(0, state.active - 1);
  wakeNext(key);
}

function enterCircuit(key: UpstreamKey): { halfOpen: boolean } {
  const state = stateFor(key);
  const now = Date.now();

  if (state.openUntil > now) {
    state.rejected += 1;
    throw new UpstreamPressureError(key, 'circuit_open');
  }

  if (state.openUntil > 0) {
    if (state.halfOpenInFlight) {
      state.rejected += 1;
      throw new UpstreamPressureError(key, 'circuit_open');
    }

    state.halfOpenInFlight = true;
    return { halfOpen: true };
  }

  return { halfOpen: false };
}

function recordSuccess(key: UpstreamKey) {
  const state = stateFor(key);
  state.consecutiveFailures = 0;
  state.openUntil = 0;
  state.halfOpenInFlight = false;
}

function recordFailure(key: UpstreamKey, halfOpen: boolean) {
  const config = CONFIG[key];
  const state = stateFor(key);

  state.halfOpenInFlight = false;
  state.consecutiveFailures += 1;

  if (halfOpen || state.consecutiveFailures >= config.failureThreshold) {
    state.openUntil = Date.now() + config.openMs;
    state.circuitOpened += 1;
  }
}

function shouldCountThrownError(
  error: unknown,
  signal: AbortSignal | undefined,
  abortIsFailure: boolean,
) {
  if (error instanceof UpstreamPressureError) return false;
  if (
    error instanceof Error &&
    error.name === 'AbortError' &&
    signal?.aborted &&
    !abortIsFailure
  ) {
    return false;
  }
  return true;
}

export async function runWithUpstreamBudget<T>(
  key: UpstreamKey,
  work: () => Promise<T>,
  options: {
    signal?: AbortSignal;
    isFailure?: (value: T) => boolean;
    abortIsFailure?: boolean;
  } = {},
): Promise<T> {
  const state = stateFor(key);
  const circuit = enterCircuit(key);
  let acquired = false;

  try {
    await acquireSlot(key, options.signal);
    acquired = true;

    const value = await work();
    const failed = options.isFailure?.(value) ?? false;

    if (failed) {
      recordFailure(key, circuit.halfOpen);
    } else {
      recordSuccess(key);
    }

    return value;
  } catch (error) {
    if (
      shouldCountThrownError(
        error,
        options.signal,
        options.abortIsFailure ?? true,
      )
    ) {
      recordFailure(key, circuit.halfOpen);
    } else if (circuit.halfOpen) {
      state.halfOpenInFlight = false;
    }

    throw error;
  } finally {
    if (acquired) releaseSlot(key);
  }
}

export function upstreamKeyForUrl(
  input: string | URL,
): UpstreamKey | null {
  try {
    const hostname = new URL(String(input)).hostname.toLowerCase();
    if (hostname === 'graphql.anilist.co') return 'anilist';
    if (hostname === 'shikimori.one' || hostname.endsWith('.shikimori.one')) {
      return 'shikimori';
    }
    if (hostname === 'kodik-api.com' || hostname.endsWith('.kodik-api.com')) {
      return 'kodik';
    }
    if (
      hostname === 'anilibria.top' ||
      hostname.endsWith('.anilibria.top') ||
      hostname === 'aniliberty.top' ||
      hostname.endsWith('.aniliberty.top') ||
      hostname === 'anilibria.app' ||
      hostname.endsWith('.anilibria.app') ||
      hostname === 'anilibria.tv' ||
      hostname.endsWith('.anilibria.tv')
    ) {
      return 'aniliberty';
    }
    if (hostname === 'api.alloha.tv' || hostname.endsWith('.alloha.tv')) {
      return 'direct';
    }
  } catch {
    return null;
  }

  return null;
}

export function isTransientUpstreamResponse(response: Response) {
  return response.status === 429 || response.status >= 500;
}

export function isUpstreamPressureError(
  error: unknown,
): error is UpstreamPressureError {
  return error instanceof UpstreamPressureError;
}

export function upstreamPressureReason(error: unknown) {
  return isUpstreamPressureError(error) ? error.reason : null;
}

export function getUpstreamRuntimeSnapshot(): UpstreamRuntimeSnapshot[] {
  const now = Date.now();

  return (Object.keys(CONFIG) as UpstreamKey[]).map((key) => {
    const config = CONFIG[key];
    const state = stateFor(key);
    const circuit =
      state.openUntil > now
        ? 'open'
        : state.openUntil > 0 && state.halfOpenInFlight
          ? 'half-open'
          : 'closed';

    return {
      key,
      active: state.active,
      queued: state.queue.length,
      concurrency: config.concurrency,
      maxQueue: config.maxQueue,
      consecutiveFailures: state.consecutiveFailures,
      circuit,
      openUntil:
        state.openUntil > now
          ? new Date(state.openUntil).toISOString()
          : null,
      accepted: state.accepted,
      rejected: state.rejected,
      circuitOpened: state.circuitOpened,
    };
  });
}
