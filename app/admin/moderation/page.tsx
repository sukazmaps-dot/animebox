'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Comment = {
  id: string;
  user_id: string | null;
  username: string;
  anime_id: number;
  animeTitle: string;
  episode_number: number | null;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

type Data = {
  comments: Comment[];
  page: number;
  hasMore: boolean;
};

type MediaHealth = {
  status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured' | 'idle';
  configured: boolean;
  provider: 'openai';
  model: string;
  checked24h: number;
  approved24h: number;
  rejected24h: number;
  borderline24h: number;
  technicalFailures24h: number;
  rateLimited24h: number;
  quotaFailures24h: number;
  latestReason: string | null;
  latestAt: string | null;
};

const healthCopy: Record<MediaHealth['status'], { title: string; detail: string }> = {
  healthy: {
    title: 'Медиа-модерация работает',
    detail: 'Новые аватары и баннеры проходят автоматическую проверку.',
  },
  degraded: {
    title: 'Автомодерация нестабильна',
    detail: 'Есть свежие rate-limit или сетевые ошибки. Новые медиа остаются приватными и уходят в ручную очередь.',
  },
  unavailable: {
    title: 'Автомодерация недоступна',
    detail: 'API сообщает о лимите/quota. Новые аватары и баннеры не публикуются автоматически — их нужно проверить вручную.',
  },
  not_configured: {
    title: 'Автомодерация не настроена',
    detail: 'На сервере отсутствует OPENAI_API_KEY. Новые медиа направляются в ручную очередь.',
  },
  idle: {
    title: 'Ожидаем первую проверку',
    detail: 'Провайдер настроен, но за последние 24 часа нет финальных результатов.',
  },
};

export default function Moderation() {
  const [data, setData] = useState<Data | null>(null);
  const [health, setHealth] = useState<MediaHealth | null>(null);
  const [state, setState] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/comments?page=${page}&state=${state}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Ошибка');
        setError('');
        setData(payload);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Ошибка');
        }
      });

    return () => controller.abort();
  }, [page, state, refresh]);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/admin/moderation-health', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          health?: MediaHealth;
        };
        if (response.ok && payload.health) setHealth(payload.health);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [refresh]);

  async function act(comment: Comment, action: 'remove' | 'restore') {
    const reason =
      action === 'remove'
        ? window.prompt('Причина удаления комментария:', 'Нарушение правил')?.trim()
        : '';

    if (action === 'remove' && !reason) return;
    if (
      !window.confirm(
        action === 'remove'
          ? 'Скрыть этот комментарий?'
          : 'Восстановить исходный текст комментария?',
      )
    ) {
      return;
    }

    setBusy(comment.id);
    try {
      const response = await fetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action, reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Ошибка');
      setRefresh((value) => value + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Ошибка');
    } finally {
      setBusy('');
    }
  }

  const healthText = health ? healthCopy[health.status] : null;

  return (
    <main className="admin-v1-page">
      <header className="admin-v1-header">
        <div>
          <span>СООБЩЕСТВО</span>
          <h1>Модерация</h1>
          <p>Комментарии и состояние автоматической проверки пользовательских медиа.</p>
        </div>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          Обновить
        </button>
      </header>

      {health && healthText && (
        <section className="admin-v1-card">
          <div className="admin-v1-card-head">
            <div>
              <span>PROFILE MEDIA</span>
              <h2>{healthText.title}</h2>
            </div>
            <code>{health.provider} · {health.model}</code>
          </div>

          <p>{healthText.detail}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/community/media"
              className="rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-4 py-2 text-sm font-bold text-violet-100"
            >
              Открыть очередь медиа →
            </Link>
          </div>

          <div className="admin-v1-metrics">
            <article>
              <span>Проверок 24ч</span>
              <strong>{health.checked24h}</strong>
              <small>audit-записи по avatar/banner</small>
            </article>
            <article>
              <span>Одобрено</span>
              <strong>{health.approved24h}</strong>
              <small>без ручной проверки</small>
            </article>
            <article>
              <span>Технические сбои</span>
              <strong>{health.technicalFailures24h}</strong>
              <small>rate-limit / timeout / provider</small>
            </article>
            <article>
              <span>429 / quota</span>
              <strong>{health.rateLimited24h + health.quotaFailures24h}</strong>
              <small>{health.latestReason || 'ошибок нет'}</small>
            </article>
          </div>
        </section>
      )}

      {error && <div className="admin-v1-error">{error}</div>}

      <div className="admin-v1-tabs">
        {[
          ['all', 'Все'],
          ['visible', 'Опубликованные'],
          ['removed', 'Скрытые'],
        ].map(([key, label]) => (
          <button
            type="button"
            className={state === key ? 'is-active' : ''}
            key={key}
            onClick={() => {
              setState(key);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="admin-v1-comments">
        {data?.comments.map((comment) => (
          <article key={comment.id} className={comment.deleted_at ? 'is-removed' : ''}>
            <div className="admin-v1-comment-meta">
              <div>
                <Link href={comment.user_id ? `/profile/${comment.user_id}` : '#'}>
                  {comment.username}
                </Link>
                <span>в</span>
                <Link href={`/anime/${comment.anime_id}`}>{comment.animeTitle}</Link>
                {comment.episode_number && <span>· серия {comment.episode_number}</span>}
              </div>
              <time>{new Date(comment.created_at).toLocaleString('ru-RU')}</time>
            </div>

            <p>{comment.body}</p>

            <footer>
              <code>{comment.id}</code>
              {comment.deleted_at ? (
                <button
                  type="button"
                  disabled={busy === comment.id}
                  onClick={() => void act(comment, 'restore')}
                >
                  Восстановить
                </button>
              ) : (
                <button
                  type="button"
                  className="is-danger"
                  disabled={busy === comment.id}
                  onClick={() => void act(comment, 'remove')}
                >
                  Скрыть
                </button>
              )}
            </footer>
          </article>
        ))}

        {data && !data.comments.length && (
          <div className="admin-v1-empty">В этом разделе комментариев нет.</div>
        )}
      </section>

      <div className="admin-v1-pager">
        <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
          ← Назад
        </button>
        <span>Страница {page}</span>
        <button
          type="button"
          disabled={!data?.hasMore}
          onClick={() => setPage((value) => value + 1)}
        >
          Дальше →
        </button>
      </div>
    </main>
  );
}
