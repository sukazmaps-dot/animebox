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

export default function Moderation() {
  const [data, setData] = useState<Data | null>(null);
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

  return (
    <main className="admin-v1-page">
      <header className="admin-v1-header">
        <div>
          <span>СООБЩЕСТВО</span>
          <h1>Модерация</h1>
          <p>Комментарии и ручной контроль пользовательских медиа. AI-проверка удалена из AnimeBox.</p>
        </div>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          Обновить
        </button>
      </header>

      <section className="admin-v1-card">
        <div className="admin-v1-card-head">
          <div>
            <span>PROFILE MEDIA</span>
            <h2>Post-moderation</h2>
          </div>
          <code>technical checks · manual control</code>
        </div>

        <p>
          Аватары и баннеры применяются сразу после технической проверки файла.
          OpenAI, rate-limit, retry и blocking-очередь больше не участвуют в сохранении профиля.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/community/media"
            className="rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-4 py-2 text-sm font-bold text-violet-100"
          >
            Старая очередь медиа →
          </Link>
        </div>

        <div className="admin-v1-metrics">
          <article>
            <span>AI запросы</span>
            <strong>0</strong>
            <small>код автомодерации удалён</small>
          </article>
          <article>
            <span>Публикация</span>
            <strong>POST</strong>
            <small>сразу после техпроверки</small>
          </article>
          <article>
            <span>Защита</span>
            <strong>ON</strong>
            <small>MIME · size · signature</small>
          </article>
          <article>
            <span>Ручной контроль</span>
            <strong>ON</strong>
            <small>админ может обработать legacy-очередь</small>
          </article>
        </div>
      </section>

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
