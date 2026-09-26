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
  let lastError: unknown;
  const maxAttempts = Math.min(3, Math.max(1, Math.round(attempts)));
  const retryBaseDelayMs = Math.min(1_500, Math.max(50, Math.round(baseDelayMs)));
  const upstream = upstreamKeyForUrl(input);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (
        isUpstreamPressureError(error) ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw error;
      }

      lastError = error;

      if (attempt === maxAttempts - 1) {
        throw error;
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, retryBaseDelayMs * 2 ** attempt);
    });
  }

  throw lastError;
}
