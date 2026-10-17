import {
  isTransientUpstreamResponse,
  isUpstreamPressureError,
  runWithUpstreamBudget,
  upstreamKeyForUrl,
} from '@/lib/upstream-resilience-server';

/**
 * fetch с повторными попытками — для нестабильных внешних API (AniList, Shikimori).
 *
 * Оба сервиса иногда отвечают 429 (rate limit) или 5xx под нагрузкой,
 * особенно когда несколько запросов уходят параллельно (например,
 * главная страница одновременно грузит "популярное" и "онгоинги").
 * Раньше единичный сбой одного запроса приводил к тому, что ВЕСЬ список
 * оставался без русской локализации/постеров на всю загрузку страницы.
 */
export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
  attempts = 3,
  baseDelayMs = 400,
): Promise<Response> {
  // One deadline for the whole retry chain, including backoff. Preserve callers'
  // tighter signals; previously callers without a signal could wait indefinitely.
  const signal = init?.signal ?? AbortSignal.timeout(8_000);
  init = { ...init, signal };
  let lastError: unknown;
  const maxAttempts = Math.min(3, Math.max(1, Math.round(attempts)));
  const retryBaseDelayMs = Math.min(1_500, Math.max(50, Math.round(baseDelayMs)));
  const upstream = upstreamKeyForUrl(input);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    signal.throwIfAborted();
    try {
      const response = upstream
        ? await runWithUpstreamBudget(
            upstream,
            () => fetch(input, init),
            {
              signal: init?.signal ?? undefined,
              isFailure: isTransientUpstreamResponse,
              abortIsFailure: false,
            },
          )
        : await fetch(input, init);

      if (response.ok) {
        return response;
      }

      // Повторяем только при rate limit / временных ошибках сервера.
      const shouldRetry = response.status === 429 || response.status >= 500;

      if (!shouldRetry || attempt === maxAttempts - 1) {
        return response;
      }

      await response.body?.cancel().catch(() => undefined);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (
        isUpstreamPressureError(error) ||
        signal.aborted ||
        (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
      ) {
        throw error;
      }

      lastError = error;

      if (attempt === maxAttempts - 1) {
        throw error;
      }
    }

    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, retryBaseDelayMs * 2 ** attempt);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  throw lastError;
}
