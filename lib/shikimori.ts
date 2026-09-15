// lib/shikimori.ts
import { fetchWithRetry } from '@/lib/fetch-retry';

const SHIKIMORI_URL = 'https://shikimori.one/api';

// Выносим заголовки в константу, чтобы не дублировать. Shikimori обязательно требует User-Agent.
const SHIKIMORI_HEADERS = {
  'User-Agent': 'AnimeBoxApp', 
  'Accept': 'application/json',
};

// Получить список аниме (для главной страницы, топов, рекомендаций)
export async function getShikimoriAnimes(limit = 20, order = 'popularity') {
  try {
    const res = await fetchWithRetry(`${SHIKIMORI_URL}/animes?limit=${limit}&order=${order}`, {
      headers: SHIKIMORI_HEADERS,
      next: { revalidate: 3600 },
    });
    
    if (!res.ok) {
      console.error(`Shikimori API Error (List): ${res.status}`);
      return [];
    }
    
    return await res.json();
  } catch (error) {
    console.error('Ошибка при получении списка Шикимори:', error);
    return [];
  }
}

// Получить конкретное аниме по ID (для страницы аниме)
export async function getShikimoriAnimeById(id: number) {
  try {
    const res = await fetchWithRetry(`${SHIKIMORI_URL}/animes/${id}`, {
      headers: SHIKIMORI_HEADERS,
      next: { revalidate: 3600 },
    });
    
    if (!res.ok) {
      console.error(`Shikimori API Error (ID ${id}): ${res.status}`);
      return null;
    }
    
    return await res.json();
  } catch (error) {
    console.error(`Ошибка при получении аниме Шикимори (ID ${id}):`, error);
    return null;
  }
}