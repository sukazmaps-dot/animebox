'use client';

import ProfilePreview from '@/components/profile/ProfilePreview';
import PlaceholderIcon from '@/components/ui/PlaceholderIcon';
import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import { premiumMediaStyle, type PremiumMediaTransform } from '@/lib/premium-studio';
import { PROFILE_APPEARANCE_CHANGED_EVENT } from '@/lib/profile-live-sync';
import { useAuthState } from '@/components/AuthStateProvider';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type CommentItem = {
  id: string;
  anime_id: number;
  episode_number: number;
  user_id: string | null;
  parent_id: string | null;
  depth: number;
  body: string;
  is_spoiler: boolean;
  created_at: string;
  deleted_at: string | null;

  author?: {
    username: string | null;
    avatarUrl: string | null;
    avatarTransform: PremiumMediaTransform | null;
    ogNumber: number | null;
    sponsor: SponsorStatus | null;
    role: PublicIdentityRole;
  } | null;
};

type Props = {
  animeId: number;
  episode: number;
};

type CommentNodeProps = {
  comment: CommentItem;
  childrenMap: Map<string, CommentItem[]>;
  onReply: (comment: CommentItem) => void;
  viewerId: string | null;
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function CommentNode({
  comment,
  childrenMap,
  onReply,
  viewerId,
}: CommentNodeProps) {
  const [spoilerOpen, setSpoilerOpen] =
    useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<
    'spam' | 'abuse' | 'spoiler' | 'scam' | 'other'
  >('spam');
  const [reportState, setReportState] = useState<
    'idle' | 'sending' | 'sent'
  >('idle');

  const children =
    childrenMap.get(comment.id) ?? [];

  const username =
    comment.author?.username ||
    'Пользователь';

  const avatar =
    comment.author?.avatarUrl ||
    '/default-avatar.webp';

  return (
    <article
      id={`comment-${comment.id}`}
      className={`episode-comment ${
        comment.depth > 0
          ? 'episode-comment--reply'
          : ''
      }`}
    >
      <header className="episode-comment__header">
        {comment.user_id ? (
          <ProfilePreview
            userId={comment.user_id}
            username={username}
            className="episode-comment__profile-link"
          >
            <span className="episode-comment__avatar-shell">
              <img
                src={avatar}
                alt=""
                width={36}
                height={36}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="episode-comment__avatar"
                style={premiumMediaStyle(comment.author?.avatarTransform)}
              />
            </span>

            <div className="episode-comment__author">
              <span className="animebox-comment-author-line">
                <UserIdentity
                  username={username}
                  role={comment.author?.role ?? null}
                  sponsor={comment.author?.sponsor ?? null}
                  compact
                />
                {comment.author?.ogNumber && (
                  <span
                    className="animebox-og-mini"
                    title="Один из первых 100 активных пользователей AnimeBox"
                  >
                    OG #{String(comment.author.ogNumber).padStart(3, '0')}
                  </span>
                )}
              </span>

              <time dateTime={comment.created_at}>
                {formatDate(comment.created_at)}
              </time>
            </div>
          </ProfilePreview>
        ) : (
          <>
            <span className="episode-comment__avatar-shell">
              <img
                src={avatar}
                alt=""
                width={36}
                height={36}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="episode-comment__avatar"
                style={premiumMediaStyle(comment.author?.avatarTransform)}
              />
            </span>

            <div className="episode-comment__author">
              <span className="animebox-comment-author-line">
                <UserIdentity
                  username={username}
                  role={comment.author?.role ?? null}
                  sponsor={comment.author?.sponsor ?? null}
                  compact
                />
                {comment.author?.ogNumber && (
                  <span
                    className="animebox-og-mini"
                    title="Один из первых 100 активных пользователей AnimeBox"
                  >
                    OG #{String(comment.author.ogNumber).padStart(3, '0')}
                  </span>
                )}
              </span>

              <time dateTime={comment.created_at}>
                {formatDate(comment.created_at)}
              </time>
            </div>
          </>
        )}
      </header>

      <div className="episode-comment__body">
        {comment.deleted_at ? (
          <p className="episode-comment__deleted">
            Комментарий удалён.
          </p>
        ) : comment.is_spoiler &&
          !spoilerOpen ? (
          <button
            type="button"
            className="episode-comment__spoiler"
            onClick={() =>
              setSpoilerOpen(true)
            }
          >
            Спойлер скрыт — показать
          </button>
        ) : (
          <p>{comment.body}</p>
        )}
      </div>

      {!comment.deleted_at && (
        <>
          <div className="episode-comment__actions">
            <button
              type="button"
              onClick={() =>
                onReply(comment)
              }
            >
              Ответить
            </button>

            {viewerId && comment.user_id !== viewerId && (
              <button
                type="button"
                onClick={() => {
                  if (reportState === 'sent') return;
                  setReportOpen((current) => !current);
                }}
              >
                {reportState === 'sent' ? 'Жалоба отправлена' : 'Пожаловаться'}
              </button>
            )}
          </div>

          {reportOpen && reportState !== 'sent' && (
            <div className="episode-comment__report">
              <select
                value={reportReason}
                disabled={reportState === 'sending'}
                onChange={(event) =>
                  setReportReason(
                    event.target.value as
                      | 'spam'
                      | 'abuse'
                      | 'spoiler'
                      | 'scam'
                      | 'other',
                  )
                }
                aria-label="Причина жалобы"
              >
                <option value="spam">Спам</option>
                <option value="abuse">Оскорбления</option>
                <option value="spoiler">Спойлер без отметки</option>
                <option value="scam">Мошенничество</option>
                <option value="other">Другое</option>
              </select>

              <button
                type="button"
                disabled={reportState === 'sending'}
                onClick={async () => {
                  setReportState('sending');

                  try {
                    const response = await fetch('/api/comments/report', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        commentId: comment.id,
                        reason: reportReason,
                      }),
                    });

                    if (!response.ok) {
                      const payload = await response.json().catch(() => ({}));
                      throw new Error(
                        typeof payload.error === 'string'
                          ? payload.error
                          : 'Не удалось отправить жалобу.',
                      );
                    }

                    setReportState('sent');
                    setReportOpen(false);
                  } catch {
                    setReportState('idle');
                  }
                }}
              >
                {reportState === 'sending' ? 'Отправляем…' : 'Отправить'}
              </button>
            </div>
          )}
        </>
      )}

      {children.length > 0 && (
        <div className="episode-comment__children">
          {children.map((child) => (
            <CommentNode
              key={child.id}
              comment={child}
              childrenMap={childrenMap}
              onReply={onReply}
              viewerId={viewerId}
            />
          ))}
        </div>
      )}
    </article>
  );
}

export default function EpisodeComments({
  animeId,
  episode,
}: Props) {
  const { user } = useAuthState();
  const [
    comments,
    setComments,
  ] = useState<CommentItem[]>([]);

  const [
    body,
    setBody,
  ] = useState('');

  const [
    spoiler,
    setSpoiler,
  ] = useState(false);

  const [
    parent,
    setParent,
  ] =
    useState<CommentItem | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    sortMode,
    setSortMode,
  ] = useState<'newest' | 'oldest'>('newest');

  const loadComments =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        try {
          setLoading(true);
          setError('');

          const response =
            await fetch(
              `/api/comments?anime_id=${animeId}&episode=${episode}`,
              {
                cache: 'no-store',
                signal,
              },
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                'Не удалось загрузить комментарии.',
            );
          }

          setComments(
            Array.isArray(data.comments)
              ? data.comments
              : [],
          );
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return;
          }

          setError(
            error instanceof Error
              ? error.message
              : 'Не удалось загрузить комментарии.',
          );
        } finally {
          setLoading(false);
        }
      },
      [animeId, episode],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    async function resetAndLoad() {
      /*
       * Сбрасываем состояние после текущего render-cycle,
       * чтобы переход /episode/1 -> /episode/2 не показывал
       * старую ветку комментариев и не создавал sync setState
       * прямо внутри тела effect.
       */
      await Promise.resolve();

      if (controller.signal.aborted) return;

      setComments([]);
      setBody('');
      setParent(null);
      setSpoiler(false);

      await loadComments(
        controller.signal,
      );
    }

    void resetAndLoad();

    return () => {
      controller.abort();
    };
  }, [loadComments]);

  useEffect(() => {
    const reloadAppearance = () => {
      void loadComments();
    };

    window.addEventListener(PROFILE_APPEARANCE_CHANGED_EVENT, reloadAppearance);
    return () => {
      window.removeEventListener(PROFILE_APPEARANCE_CHANGED_EVENT, reloadAppearance);
    };
  }, [loadComments]);

  useEffect(() => {
    if (!comments.length || !window.location.hash.startsWith('#comment-')) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector(window.location.hash);
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [comments]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const cleanBody =
      body.trim();

    if (
      !cleanBody ||
      sending
    ) {
      return;
    }

    try {
      setSending(true);
      setError('');

      const response =
        await fetch(
          '/api/comments',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              animeId,
              episode,

              body:
                cleanBody,

              isSpoiler:
                spoiler,

              parentId:
                parent?.id ??
                null,
            }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Не удалось отправить комментарий.',
        );
      }

      setBody('');
      setSpoiler(false);
      setParent(null);

      await loadComments();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить комментарий.',
      );
    } finally {
      setSending(false);
    }
  }

  const {
    roots,
    childrenMap,
  } = useMemo(() => {
    const roots:
      CommentItem[] = [];

    const childrenMap =
      new Map<
        string,
        CommentItem[]
      >();

    for (const comment of comments) {
      if (!comment.parent_id) {
        roots.push(comment);
        continue;
      }

      const children =
        childrenMap.get(
          comment.parent_id,
        ) ?? [];

      children.push(comment);

      childrenMap.set(
        comment.parent_id,
        children,
      );
    }

    return {
      roots,
      childrenMap,
    };
  }, [comments]);

  const sortedRoots = useMemo(() => {
    const next = [...roots];

    next.sort((a, b) => {
      const left = Date.parse(a.created_at);
      const right = Date.parse(b.created_at);

      return sortMode === 'newest'
        ? right - left
        : left - right;
    });

    return next;
  }, [roots, sortMode]);

  return (
    <section className="episode-comments" id="episode-comments">
      <header className="episode-comments__header">
        <div>
          <span className="episode-comments__eyebrow">
            ПОСЛЕ СЕРИИ
          </span>

          <h2>
            Обсуждение серии {episode}
          </h2>

          <p>
            Обсуждение относится только
            к этой серии.
          </p>
        </div>

        <div className="episode-comments__header-actions">
          <div className="episode-comments__sort" role="group" aria-label="Сортировка комментариев">
            <button
              type="button"
              className={sortMode === 'newest' ? 'is-active' : ''}
              aria-pressed={sortMode === 'newest'}
              onClick={() => setSortMode('newest')}
            >
              Новые
            </button>
            <button
              type="button"
              className={sortMode === 'oldest' ? 'is-active' : ''}
              aria-pressed={sortMode === 'oldest'}
              onClick={() => setSortMode('oldest')}
            >
              Сначала старые
            </button>
          </div>

          {comments.length > 0 && (
            <span className="episode-comments__count" title="Комментарии и ответы">
              {comments.length}
            </span>
          )}
        </div>
      </header>

      <div className="episode-comments__scope">
        <span>Серия {episode}</span>
        <p>Здесь обсуждают только этот эпизод. Комментарии со спойлерами скрываются до клика.</p>
      </div>

      <form
        className="episode-comments__form"
        onSubmit={submit}
      >
        {parent && (
          <div className="episode-comments__replying">
            <span>
              Ответ пользователю{' '}
              <b>
                {parent.author
                  ?.username ||
                  'Пользователь'}
              </b>
            </span>

            <button
              type="button"
              onClick={() =>
                setParent(null)
              }
            >
              ×
            </button>
          </div>
        )}

        <textarea
          value={body}
          maxLength={4000}
          placeholder={
            parent
              ? 'Напиши ответ...'
              : `Что думаешь о ${episode}-й серии?`
          }
          onChange={(event) =>
            setBody(
              event.target.value,
            )
          }
        />

        <div className="episode-comments__controls">
          <label>
            <input
              type="checkbox"
              checked={spoiler}
              onChange={(event) =>
                setSpoiler(
                  event.target
                    .checked,
                )
              }
            />

            <span>Спойлер</span>
          </label>

          <span className="episode-comments__length">
            {body.length}/4000
          </span>

          <button
            type="submit"
            disabled={
              sending ||
              !body.trim()
            }
          >
            {sending
              ? 'Отправка...'
              : 'Отправить'}
          </button>
        </div>
      </form>

      {error && (
        <p
          className="episode-comments__error"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="episode-comments__empty">
          Загружаем обсуждение…
        </div>
      ) : roots.length === 0 ? (
        <div className="episode-comments__empty episode-comments__empty--illustrated">
          <PlaceholderIcon variant="discussion" />
          <strong>Пока здесь тихо</strong>
          <span>Будь первым, кто обсудит эту серию.</span>
        </div>
      ) : (
        <div className="episode-comments__list">
          {sortedRoots.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              childrenMap={
                childrenMap
              }
              viewerId={user?.id ?? null}
              onReply={(comment) => {
                setParent(comment);

                document
                  .querySelector(
                    '.episode-comments textarea',
                  )
                  ?.scrollIntoView({
                    behavior:
                      'smooth',
                    block:
                      'center',
                  });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
