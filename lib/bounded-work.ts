/** Bound active work and the waiting queue; cancellations never leave a slot held. */
export function createBoundedWork(maxActive: number, maxQueued: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  async function acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (active < maxActive) { active++; return; }
    if (queue.length >= maxQueued) throw new Error('origin-busy');
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        const index = queue.indexOf(start);
        if (index !== -1) queue.splice(index, 1);
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };
      const start = () => { signal.removeEventListener('abort', abort); active++; resolve(); };
      queue.push(start);
      signal.addEventListener('abort', abort, {once: true});
      if (signal.aborted) abort();
    });
  }
  return {
    async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      await acquire(signal);
      try { signal.throwIfAborted(); return await work(); }
      finally { active--; queue.shift()?.(); }
    },
    stats: () => ({active, queued: queue.length, maxActive, maxQueued}),
  };
}
