'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import { createClient } from '@/lib/supabase/client';
import { resolveSponsorFrame } from '@/lib/sponsor';
import {
  deleteChatMessage,
  fetchChatAuthors,
  getOlderChatMessages,
  sendChatMessage,
  toggleChatReaction,
} from '@/lib/chat-client';
import {
  CHAT_REACTIONS,
  type ChatAuthor,
  type ChatMessage,
  type ChatMessagesPage,
  type ChatReaction,
} from '@/types/chat';
import styles from './GlobalChatClient.module.css';

const REACTION_META: Record<ChatReaction, { emoji: string; label: string }> = {
  love: { emoji: '❤️', label: 'Любовь' },
  cry: { emoji: '😭', label: 'Плач' },
  fire: { emoji: '🔥', label: 'Огонь' },
  wow: { emoji: '😮', label: 'Вау' },
  dead: { emoji: '💀', label: 'Умер' },
  peak: { emoji: '👑', label: 'Пик' },
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function avatarStyle(author: ChatAuthor | null) {
  const transform = author?.avatarTransform;
  if (!transform) return undefined;
  return {
    objectPosition: `${transform.x}% ${transform.y}%`,
    transform: `scale(${transform.zoom})`,
    transformOrigin: `${transform.x}% ${transform.y}%`,
  } as const;
}

function identityLabel(author: ChatAuthor | null) {
  if (!author) return null;
  if (author.role === 'owner') return { text: 'Владелец', kind: 'owner' };
  if (author.role === 'admin') return { text: 'Админ', kind: 'admin' };
  if (author.role === 'moderator') return { text: 'Мод', kind: 'moderator' };
  if (author.sponsor?.tier === 'patron') return { text: 'Меценат', kind: 'patron' };
  if (author.premium) return { text: 'Premium', kind: 'premium' };
  if (author.sponsor) return { text: 'Спонсор', kind: 'sponsor' };
  return null;
}

function frameKind(author: ChatAuthor | null) {
  if (!author) return null;
  if (author.role === 'owner') return 'owner';
  if (!author.sponsor) return null;
  return resolveSponsorFrame(
    author.sponsor.tier,
    author.sponsor.cosmetics?.selectedFrame,
  );
}

function getBroadcastRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const candidate = root.record ?? root.new ?? root.old_record ?? root.old;
  if (candidate && typeof candidate === 'object') return candidate as Record<string, unknown>;
  const nested = root.payload;
  if (nested && typeof nested === 'object') {
    const item = nested as Record<string, unknown>;
    const nestedCandidate = item.record ?? item.new ?? item.old_record ?? item.old;
    if (nestedCandidate && typeof nestedCandidate === 'object') {
      return nestedCandidate as Record<string, unknown>;
    }
    if (typeof item.id === 'string' || typeof item.message_id === 'string') return item;
  }
  if (typeof root.id === 'string' || typeof root.message_id === 'string') return root;
  return null;
}

function rowToMessage(row: Record<string, unknown>, author: ChatAuthor | null): ChatMessage | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.user_id !== 'string' ||
    typeof row.body !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    body: row.body,
    reply_to: typeof row.reply_to === 'string' ? row.reply_to : null,
    created_at: row.created_at,
    edited_at: typeof row.edited_at === 'string' ? row.edited_at : null,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    author,
    reactions: Object.fromEntries(CHAT_REACTIONS.map((reaction) => [reaction, 0])) as Record<
      ChatReaction,
      number
    >,
  };
}

function mergeUniqueMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = map.get(message.id);
    map.set(message.id, existing ? { ...existing, ...message } : message);
  }
  return [...map.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
}

export default function GlobalChatClient({ initialPage }: { initialPage: ChatMessagesPage }) {
  const { user, profile, loading: authLoading } = useAuthState();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialPage.messages);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [olderLoading, setOlderLoading] = useState(false);
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [reactionPicker, setReactionPicker] = useState<string | null>(null);
  const [myReactionState, setMyReactionState] = useState<Record<string, boolean>>({});
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const authorCache = useRef(new Map<string, ChatAuthor>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    for (const message of initialPage.messages) {
      if (message.author) authorCache.current.set(message.author.id, message.author);
    }
  }, [initialPage.messages]);

  const ensureAuthors = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => id && !authorCache.current.has(id));
    if (!missing.length) return;

    try {
      const authors = await fetchChatAuthors(missing);
      for (const author of authors) authorCache.current.set(author.id, author);
      setMessages((current) =>
        current.map((message) => ({
          ...message,
          author: message.author ?? authorCache.current.get(message.user_id) ?? null,
        })),
      );
    } catch (loadError) {
      console.error('[Chat] author lookup', loadError);
    }
  }, []);

  useEffect(() => {
    if (!user?.id || authorCache.current.has(user.id)) return;
    void ensureAuthors([user.id]);
  }, [ensureAuthors, user?.id]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    setHasNewBelow(false);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToBottom('auto'));
    return () => cancelAnimationFrame(frame);
  }, [scrollToBottom]);

  useEffect(() => {
    const presenceKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase.channel('chat:global', {
      config: { presence: { key: presenceKey } },
    });

    const updatePresence = () => {
      const state = channel.presenceState();
      const count = Object.values(state).reduce(
        (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
        0,
      );
      setOnlineCount(count);
    };

    channel
      .on('presence', { event: 'sync' }, updatePresence)
      .on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
        const row = getBroadcastRecord(payload);
        if (!row || typeof row.user_id !== 'string') return;
        await ensureAuthors([row.user_id]);
        const message = rowToMessage(row, authorCache.current.get(row.user_id) ?? null);
        if (!message) return;

        const viewport = viewportRef.current;
        const nearBottom = viewport
          ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 180
          : true;

        setMessages((current) => mergeUniqueMessages(current, [message]));
        if (nearBottom) requestAnimationFrame(() => scrollToBottom('smooth'));
        else setHasNewBelow(true);
      })
      .on('broadcast', { event: 'UPDATE' }, ({ payload }) => {
        const row = getBroadcastRecord(payload);
        if (!row || typeof row.id !== 'string') return;
        setMessages((current) =>
          current.map((message) =>
            message.id === row.id
              ? {
                  ...message,
                  body: typeof row.body === 'string' ? row.body : message.body,
                  edited_at:
                    typeof row.edited_at === 'string' ? row.edited_at : message.edited_at,
                  deleted_at:
                    typeof row.deleted_at === 'string' ? row.deleted_at : message.deleted_at,
                }
              : message,
          ),
        );
      })
      .on('broadcast', { event: 'REACTION_INSERT' }, ({ payload }) => {
        const row = getBroadcastRecord(payload);
        if (
          !row ||
          typeof row.message_id !== 'string' ||
          typeof row.reaction !== 'string' ||
          !CHAT_REACTIONS.includes(row.reaction as ChatReaction) ||
          row.user_id === user?.id
        ) {
          return;
        }
        const reaction = row.reaction as ChatReaction;
        setMessages((current) =>
          current.map((message) =>
            message.id === row.message_id
              ? {
                  ...message,
                  reactions: {
                    ...message.reactions,
                    [reaction]: message.reactions[reaction] + 1,
                  },
                }
              : message,
          ),
        );
      })
      .on('broadcast', { event: 'REACTION_DELETE' }, ({ payload }) => {
        const row = getBroadcastRecord(payload);
        if (
          !row ||
          typeof row.message_id !== 'string' ||
          typeof row.reaction !== 'string' ||
          !CHAT_REACTIONS.includes(row.reaction as ChatReaction) ||
          row.user_id === user?.id
        ) {
          return;
        }
        const reaction = row.reaction as ChatReaction;
        setMessages((current) =>
          current.map((message) =>
            message.id === row.message_id
              ? {
                  ...message,
                  reactions: {
                    ...message.reactions,
                    [reaction]: Math.max(0, message.reactions[reaction] - 1),
                  },
                }
              : message,
          ),
        );
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await channel.track({ joinedAt: new Date().toISOString() });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ensureAuthors, scrollToBottom, supabase, user?.id]);

  async function loadOlder() {
    if (!nextCursor || olderLoading) return;
    setOlderLoading(true);
    setError('');

    const viewport = viewportRef.current;
    const oldHeight = viewport?.scrollHeight ?? 0;

    try {
      const page = await getOlderChatMessages(nextCursor);
      for (const message of page.messages) {
        if (message.author) authorCache.current.set(message.author.id, message.author);
      }
      setMessages((current) => mergeUniqueMessages(page.messages, current));
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (!viewportRef.current) return;
        viewportRef.current.scrollTop += viewportRef.current.scrollHeight - oldHeight;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить историю.');
    } finally {
      setOlderLoading(false);
    }
  }

  async function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    const clean = body.trim();
    if (!clean || sending || !user) return;

    setSending(true);
    setError('');

    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
            const random = Math.floor(Math.random() * 16);
            const value = char === 'x' ? random : (random & 0x3) | 0x8;
            return value.toString(16);
          });

    try {
      const sent = await sendChatMessage({
        body: clean,
        replyTo: replyingTo?.id ?? null,
        requestId,
      });

      const author = authorCache.current.get(user.id) ?? null;
      const localMessage: ChatMessage = {
        id: sent.id,
        user_id: user.id,
        body: clean,
        reply_to: replyingTo?.id ?? null,
        created_at: sent.createdAt,
        edited_at: null,
        deleted_at: null,
        author,
        reactions: Object.fromEntries(CHAT_REACTIONS.map((reaction) => [reaction, 0])) as Record<
          ChatReaction,
          number
        >,
      };

      setMessages((current) => mergeUniqueMessages(current, [localMessage]));
      setBody('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom('smooth'));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить сообщение.');
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(message: ChatMessage) {
    if (!user || message.user_id !== user.id || message.deleted_at) return;
    if (!window.confirm('Удалить это сообщение?')) return;

    try {
      await deleteChatMessage(message.id);
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, body: 'Сообщение удалено.', deleted_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить сообщение.');
    }
  }

  async function react(message: ChatMessage, reaction: ChatReaction) {
    if (!user || message.deleted_at) return;
    const key = `${message.id}:${reaction}`;
    setReactionPicker(null);

    try {
      const result = await toggleChatReaction(message.id, reaction);
      const previousKnown = myReactionState[key];
      setMyReactionState((current) => ({ ...current, [key]: result.active }));

      setMessages((current) =>
        current.map((item) => {
          if (item.id !== message.id) return item;
          let delta = 0;
          if (previousKnown === undefined) delta = result.active ? 1 : -1;
          else if (previousKnown !== result.active) delta = result.active ? 1 : -1;

          return {
            ...item,
            reactions: {
              ...item.reactions,
              [reaction]: Math.max(0, item.reactions[reaction] + delta),
            },
          };
        }),
      );
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : 'Не удалось поставить реакцию.');
    }
  }

  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const composerAvatarUrl = useMemo(() => {
    const path = profile?.display_avatar_path || profile?.avatar_path;
    return path
      ? supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl
      : '/default-avatar.webp';
  }, [profile?.avatar_path, profile?.display_avatar_path, supabase]);

  return (
    <div className={styles.shell}>
      <section className={styles.chatPanel}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>ANIMEBOX COMMUNITY</span>
            <h1>Общий чат</h1>
            <p>Говори об аниме, знакомься и показывай свой статус.</p>
          </div>
          <div className={styles.online} title="Онлайн прямо сейчас">
            <span /> {onlineCount || '—'} онлайн
          </div>
        </header>

        <div className={styles.viewport} ref={viewportRef}>
          <div className={styles.historyTop}>
            {nextCursor ? (
              <button type="button" onClick={() => void loadOlder()} disabled={olderLoading}>
                {olderLoading ? 'Загружаем…' : 'Показать более ранние сообщения'}
              </button>
            ) : (
              <span>Начало доступной истории</span>
            )}
          </div>

          <div className={styles.messages}>
            {messages.map((message) => {
              const author = message.author;
              const badge = identityLabel(author);
              const reply = message.reply_to ? messageById.get(message.reply_to) ?? null : null;
              const frame = frameKind(author);

              return (
                <article
                  key={message.id}
                  className={`${styles.message} ${message.user_id === user?.id ? styles.mine : ''}`}
                >
                  <Link href={`/profile/${message.user_id}`} className={styles.avatarWrap}>
                    <img
                      src={author?.avatarUrl || '/default-avatar.webp'}
                      alt={author?.username || 'Пользователь'}
                      className={styles.avatar}
                      style={avatarStyle(author)}
                    />
                    {frame && (
                      <img
                        src={`/brand/identity/frame-${frame}.webp`}
                        alt=""
                        className={styles.frame}
                        aria-hidden="true"
                      />
                    )}
                  </Link>

                  <div className={styles.messageBody}>
                    <div className={styles.meta}>
                      <Link href={`/profile/${message.user_id}`} className={styles.username}>
                        {author?.username || 'Пользователь'}
                      </Link>
                      {badge && (
                        <span className={styles.badge} data-kind={badge.kind}>
                          {badge.text}
                        </span>
                      )}
                      <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                    </div>

                    {reply && (
                      <button
                        type="button"
                        className={styles.replyPreview}
                        onClick={() => {
                          document.getElementById(`chat-${reply.id}`)?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                          });
                        }}
                      >
                        <strong>{reply.author?.username || 'Пользователь'}</strong>
                        <span>{reply.deleted_at ? 'Сообщение удалено.' : reply.body}</span>
                      </button>
                    )}

                    <div id={`chat-${message.id}`} className={styles.text} data-deleted={Boolean(message.deleted_at)}>
                      {message.deleted_at ? 'Сообщение удалено.' : message.body}
                    </div>

                    {!message.deleted_at && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo(message);
                            composerRef.current?.focus();
                          }}
                        >
                          Ответить
                        </button>

                        <div className={styles.reactions}>
                          {CHAT_REACTIONS.filter((reaction) => message.reactions[reaction] > 0).map(
                            (reaction) => (
                              <button
                                key={reaction}
                                type="button"
                                className={styles.reactionChip}
                                data-active={myReactionState[`${message.id}:${reaction}`] || undefined}
                                onClick={() => void react(message, reaction)}
                                disabled={!user}
                                title={REACTION_META[reaction].label}
                              >
                                {REACTION_META[reaction].emoji} {message.reactions[reaction]}
                              </button>
                            ),
                          )}

                          <button
                            type="button"
                            className={styles.addReaction}
                            onClick={() =>
                              setReactionPicker((current) => (current === message.id ? null : message.id))
                            }
                            disabled={!user}
                            aria-label="Добавить реакцию"
                          >
                            +☺
                          </button>

                          {reactionPicker === message.id && (
                            <div className={styles.reactionPicker}>
                              {CHAT_REACTIONS.map((reaction) => (
                                <button
                                  key={reaction}
                                  type="button"
                                  onClick={() => void react(message, reaction)}
                                  title={REACTION_META[reaction].label}
                                >
                                  {REACTION_META[reaction].emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {message.user_id === user?.id && (
                          <button
                            type="button"
                            className={styles.deleteAction}
                            onClick={() => void removeMessage(message)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {hasNewBelow && (
          <button type="button" className={styles.newMessages} onClick={() => scrollToBottom()}>
            Новые сообщения ↓
          </button>
        )}

        <div className={styles.composerWrap}>
          {error && (
            <button type="button" className={styles.error} onClick={() => setError('')}>
              {error}
            </button>
          )}

          {!authLoading && !user ? (
            <div className={styles.authGate}>
              <div>
                <strong>Присоединяйся к разговору</strong>
                <span>Читать чат можно без аккаунта. Для сообщений нужно войти.</span>
              </div>
              <div>
                <Link href="/login">Войти</Link>
                <Link href="/register">Регистрация</Link>
              </div>
            </div>
          ) : (
            <form className={styles.composer} onSubmit={submitMessage}>
              {replyingTo && (
                <div className={styles.replying}>
                  <span>
                    Ответ <strong>@{replyingTo.author?.username || 'пользователь'}</strong>
                    <small>{replyingTo.body}</small>
                  </span>
                  <button type="button" onClick={() => setReplyingTo(null)} aria-label="Отменить ответ">
                    ×
                  </button>
                </div>
              )}

              <div className={styles.composerRow}>
                <img
                  src={composerAvatarUrl}
                  alt=""
                  className={styles.composerAvatar}
                  style={avatarStyle(
                    profile
                      ? {
                          id: profile.id,
                          username: profile.username,
                          avatarUrl: composerAvatarUrl,
                          avatarTransform: profile.display_avatar_transform ?? null,
                          sponsor: null,
                          role: null,
                          premium: false,
                        }
                      : null,
                  )}
                />
                <textarea
                  ref={composerRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value.slice(0, 500))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={1}
                  maxLength={500}
                  placeholder="Написать сообщение…"
                  disabled={authLoading || sending}
                />
                <span className={styles.counter}>{body.length}/500</span>
                <button type="submit" className={styles.send} disabled={!body.trim() || sending || authLoading}>
                  {sending ? '…' : '➤'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <aside className={styles.sidePanel}>
        <div className={styles.sideCard}>
          <span className={styles.sideEyebrow}>Сейчас</span>
          <strong>{onlineCount || '—'} онлайн</strong>
          <p>Realtime включается только на этой странице и не нагружает остальной AnimeBox.</p>
        </div>

        <div className={styles.sideCard}>
          <span className={styles.sideEyebrow}>Статусы</span>
          <div className={styles.statusExamples}>
            <span data-kind="premium">✦ Premium</span>
            <span data-kind="patron">★ Меценат</span>
            <span data-kind="owner">◆ Владелец</span>
          </div>
          <p>Premium и поддержка заметны в чате, но не дают приоритет сообщениям.</p>
          <Link href="/premium">Посмотреть Premium →</Link>
        </div>

        <div className={styles.sideCard}>
          <span className={styles.sideEyebrow}>Правила</span>
          <ol>
            <li>Без спама и флуда.</li>
            <li>Без травли и угроз.</li>
            <li>Спойлеры помечай заранее.</li>
          </ol>
          <Link href="/terms">Правила AnimeBox →</Link>
        </div>

        <div className={styles.sideCard}>
          <span className={styles.sideEyebrow}>Смотреть вместе</span>
          <strong>Anime Party</strong>
          <p>Хочешь не только обсуждать, но и смотреть вместе?</p>
          <Link href="/watch-together">Открыть Watch Together →</Link>
        </div>
      </aside>
    </div>
  );
}
