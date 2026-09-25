'use client';

import { useCallback, useEffect, useState } from 'react';

import type { CatalogHealthSnapshot } from '@/lib/catalog-availability';

import styles from './CatalogHealthDashboard.module.css';

type HealthResponse = {
  ok?: boolean;
  health?: CatalogHealthSnapshot;
  error?: string;
};

function number(value: number) {
  return value.toLocaleString('ru-RU');
}

function time(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : '—';
}

export default function CatalogHealthDashboard() {
  const [health, setHealth] = useState<CatalogHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [recheckId, setRecheckId] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/catalog-health', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as HealthResponse;
      if (!response.ok || !payload.ok || !payload.health) {
        throw new Error('Catalog Health недоступен.');
      }
      setHealth(payload.health);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить данные.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = async () => {
    const animeId = Number(recheckId);
    if (!Number.isSafeInteger(animeId) || animeId <= 0) {
      setMessage('Укажи корректный AniList ID.');
      return;
    }

    setRechecking(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/catalog-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animeId }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        availability?: { availability_status?: string };
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Recheck не выполнен.');
      }

      setMessage(
        `Anime #${animeId}: ${payload.availability?.availability_status ?? 'unknown'}`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Recheck не выполнен.');
    } finally {
      setRechecking(false);
    }
  };

  return (
    <section className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <span>CATALOG INTEGRITY · PATCH 18.2</span>
          <h1>Catalog Health</h1>
          <p>
            Реестр подтверждённой доступности тайтлов. Временные ошибки провайдера
            остаются UNKNOWN и не удаляют аниме из каталога.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.kpis}>
        <article><span>Проверено</span><strong>{number(health?.counts.total ?? 0)}</strong></article>
        <article><span>Playable</span><strong>{number(health?.counts.playable ?? 0)}</strong></article>
        <article><span>Unknown</span><strong>{number(health?.counts.unknown ?? 0)}</strong></article>
        <article><span>Unavailable</span><strong>{number(health?.counts.unavailable ?? 0)}</strong></article>
        <article><span>Нужен recheck</span><strong>{number(health?.counts.stale ?? 0)}</strong></article>
      </div>

      <section className={styles.recheck}>
        <div>
          <strong>Ручная проверка</strong>
          <small>AniList ID. Проверка идёт через ту же ограниченную очередь.</small>
        </div>
        <input
          value={recheckId}
          onChange={(event) => setRecheckId(event.target.value)}
          inputMode="numeric"
          placeholder="Например 154587"
        />
        <button type="button" onClick={() => void recheck()} disabled={rechecking}>
          {rechecking ? 'Проверяем…' : 'Recheck'}
        </button>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <strong>Недавно подтверждённые недоступные</strong>
          <small>{health?.generatedAt ? `снимок ${time(health.generatedAt)}` : ''}</small>
        </div>

        <div className={styles.rows}>
          {(health?.recentUnavailable ?? []).length === 0 && (
            <div className={styles.empty}>Пока нет подтверждённых недоступных тайтлов.</div>
          )}

          {(health?.recentUnavailable ?? []).map((item) => (
            <article key={item.animeId}>
              <div>
                <strong>Anime #{item.animeId}</strong>
                <small>MAL {item.malId ?? '—'} · miss {item.consecutiveMisses}</small>
              </div>
              <div>
                <span>{item.reason || 'Источник не найден'}</span>
                <small>{time(item.lastCheckedAt)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
