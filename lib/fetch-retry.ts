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

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);

      if (response.ok) {
        return response;
      }

      // Повторяем только при rate limit / временных ошибках сервера.
      const shouldRetry = response.status === 429 || response.status >= 500;

      if (!shouldRetry || attempt === attempts - 1) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      lastError = error;

      if (attempt === attempts - 1) {
        throw error;
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, baseDelayMs * 2 ** attempt);
    });
  }

  throw lastError;
}
