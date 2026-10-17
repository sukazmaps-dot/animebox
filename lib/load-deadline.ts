/** Bounds the whole operation, including SDK auth locks before fetch begins. */
export async function withLoadDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 8000,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    const stop = (reason: unknown) => {
      reject(reason);
      controller.abort(reason);
    };
    cancel = () => stop(parentSignal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (parentSignal?.aborted) { cancel(); return; }
    parentSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => stop(new Error('LOAD_DEADLINE_EXCEEDED')), timeoutMs);
  });
  try {
    const work = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return operation(controller.signal);
    });
    return await Promise.race([work, interrupted]);
  } finally {
    clearTimeout(timer);
    if (cancel) parentSignal?.removeEventListener('abort', cancel);
  }
}
