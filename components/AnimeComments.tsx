'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { communityRequest } from '@/lib/community-client';
import { createClient } from '@/lib/supabase/client';

type Comment = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  body: string;
  is_spoiler: boolean;
  depth: number;
  created_at: string;
  deleted_at: string | null;
  author?: {
    username: string | null;
    avatarUrl: string | null;
  } | null;
};

type Page = { comments: Comment[]; nextCursor: string | null };

export function SpoilerText({ text, spoiler }: { text: string; spoiler: boolean }) {
  const [revealed, setRevealed] = useState(false);

  return spoiler && !revealed ? (
    <button
      type="button"
      className="community-spoiler"
      onClick={() => setRevealed(true)}
      aria-expanded={false}
    >
      Спойлер · нажми, чтобы прочитать
    </button>
  ) : (
    <div>
      <p className="community-comment-text">{text}</p>
      {spoiler && (
        <button type="button" className="community-comment__subtle" onClick={() => setRevealed(false)} aria-expanded={true}>
          Скрыть спойлер
        </button>
      )}
    </div>
  );
}

function CommentForm({
  animeId,
  parentId,
  onSaved,
}: {
  animeId: number;
  parentId: string | null;
  onSaved: () => void;
}) {
  const [body, setBody] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ payload: string; id: string } | null>(null);

  return (
    <form
      className={`community-form ${parentId ? 'community-form--reply' : ''}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;

        const cleanBody = body.trim();
        if (!cleanBody) return;

        setBusy(true);
        setError('');
        const payload = JSON.stringify({ animeId, parentId, body: cleanBody, isSpoiler });

        // Reuse the idempotency token if a network timeout made the previous
        // result uncertain, preventing duplicate comments.
        if (request.current?.payload !== payload) {
          request.current = { payload, id: crypto.randomUUID() };
        }

        try {
          await communityRequest('comments', {
            animeId,
            parentId,
            body: cleanBody,
            isSpoiler,
            requestId: request.current.id,
          });
          setBody('');
          setIsSpoiler(false);
          request.current = null;
          onSaved();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <textarea
        aria-label={parentId ? 'Текст ответа' : 'Текст комментария'}
        required
        maxLength={4000}
        rows={parentId ? 2 : 3}
        value={body}
        disabled={busy}
        onChange={(event) => setBody(event.target.value)}
        placeholder={parentId ? 'Напиши ответ…' : 'Поделись впечатлениями…'}
      />

      <div className="community-form__footer">
        <label>
          <input
            type="checkbox"
            checked={isSpoiler}
            disabled={busy}
            onChange={(event) => setIsSpoiler(event.target.checked)}
          />{' '}
          Спойлер
        </label>

        <div className="community-form__submit-row">
          <small>{body.length}/4000</small>
          <button disabled={busy || !body.trim()} type="submit">
            {busy ? 'Отправляем…' : parentId ? 'Ответить' : 'Отправить'}
          </button>
        </div>
      </div>

      {error && <p className="community-form__error" role="alert">{error}</p>}
    </form>
  );
}

function CommentNode({
  animeId,
  comment,
  currentUserId,
}: {
  animeId: number;
  comment: Comment;
  currentUserId: string | null;
}) {
  const [reply, setReply] = useState(false);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [deleted, setDeleted] = useState(Boolean(comment.deleted_at));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const mine = Boolean(currentUserId && currentUserId === comment.user_id);
  const username = comment.author?.username || (comment.user_id ? `Участник ${comment.user_id.slice(0, 8)}` : 'Удалённый аккаунт');
  const avatar = comment.author?.avatarUrl || '/default-avatar.webp';

  async function removeComment() {
    if (deleting || !mine) return;
    if (!window.confirm('Удалить комментарий? Ответы под ним сохранятся.')) return;

    setDeleting(true);
    setDeleteError('');

    try {
      await communityRequest('comments', { id: comment.id }, 'DELETE');
      setDeleted(true);
      setReply(false);
    } catch (error) {
      setDeleteError((error as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className={`community-comment ${deleted ? 'is-deleted' : ''}`}>
      <header className="community-comment__header">
        {comment.user_id ? (
          <Link
            href={`/profile/${comment.user_id}`}
            className="community-comment__identity community-comment__profile-link"
            aria-label={`Открыть профиль ${username}`}
          >
            <img src={avatar} width="38" height="38" loading="lazy" alt="" className="community-comment__avatar" />
            <div>
              <strong>{username}</strong>
              <time dateTime={comment.created_at}>
                {new Date(comment.created_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          </Link>
        ) : (
          <div className="community-comment__identity">
            <img src={avatar} width="38" height="38" loading="lazy" alt="" className="community-comment__avatar" />
            <div>
              <strong>{username}</strong>
              <time dateTime={comment.created_at}>
                {new Date(comment.created_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          </div>
        )}
      </header>

      {deleted ? (
        <p className="community-comment__deleted">Комментарий удалён</p>
      ) : (
        <SpoilerText text={comment.body} spoiler={comment.is_spoiler} />
      )}

      <div className="community-comment-actions">
        {!deleted && currentUserId && comment.depth < 8 && (
          <button type="button" onClick={() => setReply((value) => !value)}>
            {reply ? 'Отменить' : 'Ответить'}
          </button>
        )}

        {comment.depth < 8 && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? 'Свернуть ответы' : 'Ответы'}
          </button>
        )}

        {mine && !deleted && (
          <button type="button" className="community-comment__delete" disabled={deleting} onClick={() => void removeComment()}>
            {deleting ? 'Удаляем…' : 'Удалить'}
          </button>
        )}
      </div>

      {deleteError && <p className="community-form__error" role="alert">{deleteError}</p>}

      {reply && !deleted && (
        <CommentForm
          animeId={animeId}
          parentId={comment.id}
          onSaved={() => {
            setReply(false);
            setOpen(true);
            setRevision((value) => value + 1);
          }}
        />
      )}

      {open && (
        <CommentBranch
          key={revision}
          animeId={animeId}
          parentId={comment.id}
          currentUserId={currentUserId}
        />
      )}
    </article>
  );
}

function CommentBranch({
  animeId,
  parentId,
  currentUserId,
}: {
  animeId: number;
  parentId: string | null;
  currentUserId: string | null;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  async function load(cursor: string | null) {
    setBusy(true);
    setError('');

    try {
      const page = await communityRequest<Page>(
        `comments?animeId=${animeId}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${parentId ? `&parent=${parentId}` : ''}`,
      );

      setComments((previous) =>
        cursor === null
          ? page.comments
          : [...previous, ...page.comments.filter((item) => !previous.some((old) => old.id === item.id))],
      );
      setNextCursor(page.nextCursor);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    const path = `comments?animeId=${animeId}${parentId ? `&parent=${parentId}` : ''}`;

    communityRequest<Page>(path)
      .then((page) => {
        if (!active) return;
        setComments(page.comments);
        setNextCursor(page.nextCursor);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => {
      active = false;
    };
  }, [animeId, parentId]);

  return (
    <div className={parentId ? 'community-replies' : 'community-comment-list'}>
      {comments.map((comment) => (
        <CommentNode key={comment.id} comment={comment} animeId={animeId} currentUserId={currentUserId} />
      ))}

      {busy && <p className="community-muted" role="status">Загружаем комментарии…</p>}
      {!busy && !error && comments.length === 0 && (
        <p className="community-muted">{parentId ? 'Ответов пока нет.' : 'Здесь пока тихо. Начни обсуждение.'}</p>
      )}
      {error && (
        <p className="community-form__error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => void load(nextCursor)}>Повторить</button>
        </p>
      )}
      {nextCursor && (
        <button className="community-load-more" type="button" disabled={busy} onClick={() => void load(nextCursor)}>
          Ещё комментарии
        </button>
      )}
    </div>
  );
}

export default function AnimeComments({ animeId }: { animeId: number }) {
  const [revision, setRevision] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user.id ?? null);
      setAuthReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <section className="community-panel community-discussion">
      <div className="community-discussion__heading">
        <div className="community-discussion__title">
          <span className="community-discussion__eyebrow">AnimeBox Community</span>
          <div className="community-discussion__title-row">
            <span className="community-discussion__icon" aria-hidden="true">✦</span>
            <h2>Обсуждение</h2>
          </div>
        </div>

        <div className="community-discussion__rules">
          <span className="community-discussion__rules-dot" aria-hidden="true" />
          Спойлеры отмечай перед отправкой
        </div>
      </div>

      {authReady && currentUserId ? (
        <CommentForm animeId={animeId} parentId={null} onSaved={() => setRevision((value) => value + 1)} />
      ) : authReady ? (
        <div className="community-login-hint">
          <span>Хочешь присоединиться к обсуждению?</span>
          <Link href="/login">Войти</Link>
        </div>
      ) : (
        <div className="community-form community-form--loading" aria-hidden="true" />
      )}

      <CommentBranch
        key={`${animeId}:${revision}`}
        animeId={animeId}
        parentId={null}
        currentUserId={currentUserId}
      />
    </section>
  );
}
