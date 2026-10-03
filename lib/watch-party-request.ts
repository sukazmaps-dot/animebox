/** Bounded request including JSON parsing; mutation requests are never retried. */
export async function requestWatchPartyJson<T>(
  url: string, options: RequestInit = {}, timeoutMs = 12_000,
): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json() as T;
    return { response, payload };
  } catch (error) {
    if (timedOut) throw new Error('Сервер не ответил вовремя. Проверь соединение и попробуй ещё раз.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
