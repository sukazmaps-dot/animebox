'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import { createClient } from '@/lib/supabase/client';
import { resolveSponsorFrame } from '@/lib/sponsor';
import {
  deleteChatMessage,
  fetchChatAuthors,
  getChatMe,
  getChatSettings,
  getOlderChatMessages,
  markChatSeen,
  moderateCommunity,
  reportChatMessage,
  sendChatMessage,
  toggleChatReaction,
} from '@/lib/chat-client';
import {
  CHAT_REACTIONS,
  type ChatAuthor,
  type ChatMeState,
  type ChatMessage,
  type ChatMessagesPage,
  type ChatReaction,
  type ChatReportReason,
  type ChatSettingsState,
} from '@/types/chat';
import styles from './GlobalChatV11Client.module.css';

const REACTION_META: Record<ChatReaction, { emoji: string; label: string }> = {
  love: { emoji: '❤️', label: 'Любовь' },
  cry: { emoji: '😭', label: 'Плач' },
  fire: { emoji: '🔥', label: 'Огонь' },
  wow: { emoji: '😮', label: 'Вау' },
  dead: { emoji: '💀', label: 'Умер' },
  peak: { emoji: '👑', label: 'Пик' },
};

const REPORTS: Array<{ id: ChatReportReason; label: string }> = [
  { id: 'spam', label: 'Спам' },
  { id: 'abuse', label: 'Оскорбления / травля' },
  { id: 'nsfw', label: '18+ / шок-контент' },
  { id: 'spoiler', label: 'Спойлер без предупреждения' },
  { id: 'scam', label: 'Мошенничество' },
  { id: 'other', label: 'Другое' },
];

type Delivery = 'sending' | 'sent' | 'failed';
type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
  return resolveSponsorFrame(author.sponsor.tier, author.sponsor.cosmetics?.selectedFrame);
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
    if (nestedCandidate && typeof nestedCandidate === 'object') return nestedCandidate as Record<string, unknown>;
    if (typeof item.id === 'string' || typeof item.message_id === 'string') return item;
  }
  if (typeof root.id === 'string' || typeof root.message_id === 'string') return root;
  return null;
}

function emptyReactions() {
  return Object.fromEntries(CHAT_REACTIONS.map((reaction) => [reaction, 0])) as Record<ChatReaction, number>;
}

function rowToMessage(row: Record<string, unknown>, author: ChatAuthor | null): ChatMessage | null {
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.body !== 'string' || typeof row.created_at !== 'string') return null;
  return {
    id: row.id,
    user_id: row.user_id,
    body: row.body,
    reply_to: typeof row.reply_to === 'string' ? row.reply_to : null,
    created_at: row.created_at,
    edited_at: typeof row.edited_at === 'string' ? row.edited_at : null,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    kind: row.kind === 'system' ? 'system' : 'user',
    author,
    reactions: emptyReactions(),
  };
}

function mergeUniqueMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = map.get(message.id);
    map.set(message.id, existing ? { ...existing, ...message } : message);
  }
  return [...map.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

function connectionLabel(value: Connection) {
  if (value === 'online') return 'Онлайн';
  if (value === 'connecting') return 'Подключаемся…';
  if (value === 'reconnecting') return 'Переподключаемся…';
  return 'Нет соединения';
}

export default function GlobalChatV11Client({ initialPage }: { initialPage: ChatMessagesPage }) {
  const { user, profile, loading: authLoading } = useAuthState();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialPage.messages);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [olderLoading, setOlderLoading] = useState(false);
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [reactionPicker, setReactionPicker] = useState<string | null>(null);
  const [myReactionState, setMyReactionState] = useState<Record<string, boolean>>({});
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [delivery, setDelivery] = useState<Record<string, Delivery>>({});
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettingsState>({ slowModeSeconds: 0, pinnedMessage: null });
  const [me, setMe] = useState<ChatMeState | null>(null);
  const [nextSendAt, setNextSendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const authorCache = useRef(new Map<string, ChatAuthor>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSeenWriteRef = useRef(0);

  useEffect(() => {
    for (const message of initialPage.messages) if (message.author) authorCache.current.set(message.author.id, message.author);
  }, [initialPage.messages]);

  const ensureAuthors = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => id && !authorCache.current.has(id));
    if (!missing.length) return;
    try {
      const authors = await fetchChatAuthors(missing);
      for (const author of authors) authorCache.current.set(author.id, author);
      setMessages((current) => current.map((message) => ({
        ...message,
        author: message.author ?? authorCache.current.get(message.user_id) ?? null,
      })));
    } catch (loadError) {
      console.error('[Chat] author lookup', loadError);
    }
  }, []);

  useEffect(() => {
    void getChatSettings().then(setSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      const frame = window.requestAnimationFrame(() => setMe(null));
      return () => window.cancelAnimationFrame(frame);
    }
    let active = true;
    void getChatMe()
      .then((value) => { if (active) setMe(value); })
      .catch(() => undefined);
    const timer = window.setTimeout(() => {
      if (!active) return;
      void markChatSeen().then(({ seenAt }) => {
        lastSeenWriteRef.current = Date.parse(seenAt);
        window.dispatchEvent(new CustomEvent('animebox:chat-unread-changed', { detail: { unread: 0 } }));
      }).catch(() => undefined);
    }, 1500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || authorCache.current.has(user.id)) return;
    void ensureAuthors([user.id]);
  }, [ensureAuthors, user?.id]);

  useEffect(() => {
    const onOnline = () => { setBrowserOnline(true); setConnection((current) => current === 'offline' ? 'reconnecting' : current); };
    const onOffline = () => { setBrowserOnline(false); setConnection('offline'); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => {
    if (nextSendAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [nextSendAt]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    setHasNewBelow(false);
  }, []);

  const markSeenSoon = useCallback(() => {
    if (!user?.id || Date.now() - lastSeenWriteRef.current < 10_000) return;
    lastSeenWriteRef.current = Date.now();
    void markChatSeen().then(({ seenAt }) => {
      lastSeenWriteRef.current = Date.parse(seenAt);
      window.dispatchEvent(new CustomEvent('animebox:chat-unread-changed', { detail: { unread: 0 } }));
    }).catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToBottom('auto'));
    return () => cancelAnimationFrame(frame);
  }, [scrollToBottom]);

  useEffect(() => {
    const presenceKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase.channel('chat:global', { config: { presence: { key: presenceKey } } });
    const updatePresence = () => {
      const state = channel.presenceState();
      setOnlineCount((Object.values(state) as unknown[]).reduce<number>((total, entries) => total + (Array.isArray(entries) ? entries.length : 0), 0));
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
        const nearBottom = viewport ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 180 : true;
        setMessages((current) => mergeUniqueMessages(current, [message]));
        if (nearBottom) {
          requestAnimationFrame(() => scrollToBottom('smooth'));
          markSeenSoon();
        } else {
          setHasNewBelow(true);
        }
      })
      .on('broadcast', { event: 'UPDATE' }, ({ payload }) => {
        const row = getBroadcastRecord(payload);
        if (!row || typeof row.id !== 'string') return;
        setMessages((current) => current.map((message) => message.id === row.id ? {
          ...message,
          body: typeof row.body === 'string' ? row.body : message.body,
          edited_at: typeof row.edited_at === 'string' ? row.edited_at : message.edited_at,
          deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : message.deleted_at,
        } : message));
      })
      .on('broadcast', { event: 'REACTION_INSERT' }, ({ payload }) => updateRealtimeReaction(payload, 1))
      .on('broadcast', { event: 'REACTION_DELETE' }, ({ payload }) => updateRealtimeReaction(payload, -1))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('online');
          await channel.track({ joinedAt: new Date().toISOString(), userId: user?.id ?? null });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection(navigator.onLine ? 'reconnecting' : 'offline');
        } else if (status === 'CLOSED') {
          setConnection(navigator.onLine ? 'reconnecting' : 'offline');
        }
      });

    function updateRealtimeReaction(payload: unknown, delta: number) {
      const row = getBroadcastRecord(payload);
      if (!row || typeof row.message_id !== 'string' || typeof row.reaction !== 'string' || !CHAT_REACTIONS.includes(row.reaction as ChatReaction) || row.user_id === user?.id) return;
      const reaction = row.reaction as ChatReaction;
      setMessages((current) => current.map((message) => message.id === row.message_id ? {
        ...message,
        reactions: { ...message.reactions, [reaction]: Math.max(0, Number(message.reactions[reaction] ?? 0) + delta) },
      } : message));
    }

    return () => { void supabase.removeChannel(channel); };
  }, [ensureAuthors, markSeenSoon, scrollToBottom, supabase, user?.id]);

  async function loadOlder() {
    if (!nextCursor || olderLoading) return;
    setOlderLoading(true);
    setError('');
    const viewport = viewportRef.current;
    const oldHeight = viewport?.scrollHeight ?? 0;
    try {
      const page = await getOlderChatMessages(nextCursor);
      for (const message of page.messages) if (message.author) authorCache.current.set(message.author.id, message.author);
      setMessages((current) => mergeUniqueMessages(page.messages, current));
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (viewportRef.current) viewportRef.current.scrollTop += viewportRef.current.scrollHeight - oldHeight;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить историю.');
    } finally {
      setOlderLoading(false);
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const clean = body.trim();
    if (!clean || sending || !user || !browserOnline || now < nextSendAt || (me && me.restriction.status !== 'active')) return;

    const requestId = crypto.randomUUID();
    const tempId = `pending-${requestId}`;
    const author = authorCache.current.get(user.id) ?? null;
    const optimistic: ChatMessage = {
      id: tempId,
      user_id: user.id,
      body: clean,
      reply_to: replyingTo?.id ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      kind: 'user',
      author,
      reactions: emptyReactions(),
    };

    setSending(true);
    setError('');
    setMessages((current) => mergeUniqueMessages(current, [optimistic]));
    setDelivery((current) => ({ ...current, [tempId]: 'sending' }));
    const originalReply = replyingTo;
    setBody('');
    setReplyingTo(null);
    requestAnimationFrame(() => scrollToBottom('smooth'));

    try {
      const sent = await sendChatMessage({ body: clean, replyTo: originalReply?.id ?? null, requestId });
      const committed: ChatMessage = { ...optimistic, id: sent.id, created_at: sent.createdAt };
      setMessages((current) => mergeUniqueMessages(current.filter((item) => item.id !== tempId && item.id !== sent.id), [committed]));
      setDelivery((current) => {
        const next = { ...current };
        delete next[tempId];
        next[sent.id] = 'sent';
        return next;
      });
      const cooldown = Math.max(2, settings.slowModeSeconds || me?.slowModeSeconds || 0);
      setNextSendAt(Date.now() + cooldown * 1000);
      setNow(Date.now());
      markSeenSoon();
    } catch (sendError) {
      setDelivery((current) => ({ ...current, [tempId]: 'failed' }));
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить сообщение.');
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(message: ChatMessage) {
    if (!user || message.deleted_at || message.id.startsWith('pending-')) return;
    if (!window.confirm('Удалить это сообщение?')) return;
    try {
      await deleteChatMessage(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, body: 'Сообщение удалено.', deleted_at: new Date().toISOString() } : item));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить сообщение.');
    }
  }

  async function react(message: ChatMessage, reaction: ChatReaction) {
    if (!user || message.deleted_at || message.id.startsWith('pending-')) return;
    const key = `${message.id}:${reaction}`;
    setReactionPicker(null);
    try {
      const result = await toggleChatReaction(message.id, reaction);
      const previousKnown = myReactionState[key];
      setMyReactionState((current) => ({ ...current, [key]: result.active }));
      setMessages((current) => current.map((item) => {
        if (item.id !== message.id) return item;
        let delta = 0;
        if (previousKnown === undefined) delta = result.active ? 1 : -1;
        else if (previousKnown !== result.active) delta = result.active ? 1 : -1;
        return { ...item, reactions: { ...item.reactions, [reaction]: Math.max(0, item.reactions[reaction] + delta) } };
      }));
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : 'Не удалось поставить реакцию.');
    }
  }

  async function report(message: ChatMessage, reason: ChatReportReason) {
    setReportingId(null);
    try {
      await reportChatMessage({ messageId: message.id, reason });
      setNotice('Жалоба отправлена модераторам ✓');
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Не удалось отправить жалобу.');
    }
  }

  async function moderate(message: ChatMessage, action: 'delete' | 'mute10' | 'mute60' | 'mute1440' | 'ban') {
    if (!me?.role || message.id.startsWith('pending-')) return;
    setModeratingId(null);
    try {
      if (action === 'delete') await moderateCommunity({ action: 'delete_message', messageId: message.id });
      if (action.startsWith('mute')) {
        const minutes = action === 'mute10' ? 10 : action === 'mute60' ? 60 : 1440;
        await moderateCommunity({ action: 'mute_user', userId: message.user_id, minutes, reason: 'Модерация общего чата' });
      }
      if (action === 'ban') await moderateCommunity({ action: 'ban_user', userId: message.user_id, reason: 'Модерация общего чата' });
      if (action === 'delete') {
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, body: 'Сообщение удалено.', deleted_at: new Date().toISOString() } : item));
      }
      setNotice(action === 'delete' ? 'Сообщение удалено ✓' : 'Ограничение применено ✓');
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : 'Не удалось применить модерацию.');
    }
  }

  const messageById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const usernameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const message of messages) {
      const username = message.author?.username?.trim();
      if (username) map.set(username.toLocaleLowerCase('ru-RU'), message.user_id);
    }
    return map;
  }, [messages]);

  const firstUnreadId = useMemo(() => {
    if (!me?.lastSeenAt) return null;
    const seen = Date.parse(me.lastSeenAt);
    return messages.find((message) => Date.parse(message.created_at) > seen && message.user_id !== user?.id)?.id ?? null;
  }, [me, messages, user?.id]);

  const composerAvatarUrl = useMemo(() => {
    const path = profile?.display_avatar_path || profile?.avatar_path;
    return path ? supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl : '/default-avatar.webp';
  }, [profile?.avatar_path, profile?.display_avatar_path, supabase]);

  const cooldownSeconds = Math.max(0, Math.ceil((nextSendAt - now) / 1000));
  const restricted = Boolean(me && me.restriction.status !== 'active');

  function renderText(text: string): ReactNode {
    const parts = text.split(/(@[\p{L}\p{N}_.-]{3,24})/gu);
    return parts.map((part, index) => {
      if (!part.startsWith('@')) return <span key={index}>{part}</span>;
      const username = part.slice(1);
      const userId = usernameMap.get(username.toLocaleLowerCase('ru-RU'));
      return userId
        ? <Link key={index} className={styles.mention} href={`/profile/${userId}`}>{part}</Link>
        : <span key={index} className={styles.mention}>{part}</span>;
    });
  }

  return (
    <div className={styles.shell}>
      <section className={styles.chatPanel}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>ANIMEBOX COMMUNITY · v1.1</span>
            <h1>Общий чат</h1>
            <p>Общайся, отвечай, упоминай пользователей и показывай свой профиль.</p>
          </div>
          <div className={styles.headerStatus}>
            <span className={styles.connection} data-state={connection}>{connectionLabel(connection)}</span>
            <span className={styles.online}>● {onlineCount || '—'} онлайн</span>
          </div>
        </header>

        {connection !== 'online' && (
          <div className={styles.connectionBanner} data-state={connection}>
            {connection === 'offline' ? 'Интернет недоступен. Сообщения не отправляются.' : 'Realtime переподключается. История чата остаётся доступной.'}
          </div>
        )}

        {settings.pinnedMessage && (
          <button
            type="button"
            className={styles.pinned}
            onClick={() => document.getElementById(`chat-${settings.pinnedMessage?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            <span>📌 Закреплено · {settings.pinnedMessage.username}</span>
            <strong>{settings.pinnedMessage.body}</strong>
          </button>
        )}

        <div
          className={styles.viewport}
          ref={viewportRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
            if (nearBottom) { setHasNewBelow(false); markSeenSoon(); }
          }}
        >
          <div className={styles.historyTop}>
            {nextCursor ? (
              <button type="button" onClick={() => void loadOlder()} disabled={olderLoading}>
                {olderLoading ? 'Загружаем…' : 'Показать более ранние сообщения'}
              </button>
            ) : <span>Начало доступной истории</span>}
          </div>

          <div className={styles.messages}>
            {messages.map((message) => {
              const author = message.author;
              const badge = identityLabel(author);
              const reply = message.reply_to ? messageById.get(message.reply_to) ?? null : null;
              const frame = frameKind(author);
              const state = delivery[message.id];
              const isSystem = message.kind === 'system';

              return (
                <div key={message.id}>
                  {message.id === firstUnreadId && <div className={styles.unreadDivider}>Новые сообщения</div>}
                  <article className={`${styles.message} ${message.user_id === user?.id ? styles.mine : ''} ${isSystem ? styles.systemMessage : ''}`}>
                    <Link href={`/profile/${message.user_id}`} className={styles.avatarWrap}>
                      <img src={author?.avatarUrl || '/default-avatar.webp'} alt={author?.username || 'Пользователь'} className={styles.avatar} style={avatarStyle(author)} />
                      {frame && <img src={`/brand/identity/frame-${frame}.webp`} alt="" className={styles.frame} aria-hidden="true" />}
                    </Link>

                    <div className={styles.messageBody}>
                      <div className={styles.meta}>
                        <Link href={`/profile/${message.user_id}`} className={styles.username}>{isSystem ? 'AnimeBox' : author?.username || 'Пользователь'}</Link>
                        {isSystem ? <span className={styles.systemBadge}>SYSTEM</span> : badge && <span className={styles.badge} data-kind={badge.kind}>{badge.text}</span>}
                        <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                        {state === 'sending' && <span className={styles.delivery}>отправляется…</span>}
                        {state === 'failed' && <button className={styles.failed} type="button" onClick={() => { setBody(message.body); setMessages((current) => current.filter((item) => item.id !== message.id)); setDelivery((current) => { const next={...current}; delete next[message.id]; return next; }); composerRef.current?.focus(); }}>не отправлено · повторить</button>}
                      </div>

                      {reply && (
                        <button type="button" className={styles.replyPreview} onClick={() => document.getElementById(`chat-${reply.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                          <strong>{reply.author?.username || 'Пользователь'}</strong>
                          <span>{reply.deleted_at ? 'Сообщение удалено.' : reply.body}</span>
                        </button>
                      )}

                      <div id={`chat-${message.id}`} className={styles.text} data-deleted={Boolean(message.deleted_at)}>
                        {message.deleted_at ? 'Сообщение удалено.' : renderText(message.body)}
                      </div>

                      {!message.deleted_at && !isSystem && !message.id.startsWith('pending-') && (
                        <div className={styles.actions}>
                          <button type="button" onClick={() => { setReplyingTo(message); composerRef.current?.focus(); }}>Ответить</button>
                          <div className={styles.reactions}>
                            {CHAT_REACTIONS.filter((reaction) => message.reactions[reaction] > 0).map((reaction) => (
                              <button key={reaction} type="button" className={styles.reactionChip} data-active={myReactionState[`${message.id}:${reaction}`] || undefined} onClick={() => void react(message, reaction)} disabled={!user} title={REACTION_META[reaction].label}>
                                {REACTION_META[reaction].emoji} {message.reactions[reaction]}
                              </button>
                            ))}
                            <button type="button" className={styles.addReaction} onClick={() => setReactionPicker((current) => current === message.id ? null : message.id)} disabled={!user}>+☺</button>
                            {reactionPicker === message.id && <div className={styles.reactionPicker}>{CHAT_REACTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => void react(message, reaction)} title={REACTION_META[reaction].label}>{REACTION_META[reaction].emoji}</button>)}</div>}
                          </div>

                          {message.user_id === user?.id ? (
                            <button type="button" className={styles.deleteAction} onClick={() => void removeMessage(message)}>Удалить</button>
                          ) : user ? (
                            <button type="button" className={styles.reportAction} onClick={() => setReportingId((current) => current === message.id ? null : message.id)}>Пожаловаться</button>
                          ) : null}

                          {me?.role && message.user_id !== user?.id && <button type="button" className={styles.modAction} onClick={() => setModeratingId((current) => current === message.id ? null : message.id)}>Модерация</button>}

                          {reportingId === message.id && (
                            <div className={styles.actionPopover}>
                              <strong>Причина жалобы</strong>
                              {REPORTS.map((reason) => <button key={reason.id} type="button" onClick={() => void report(message, reason.id)}>{reason.label}</button>)}
                            </div>
                          )}

                          {moderatingId === message.id && (
                            <div className={`${styles.actionPopover} ${styles.modPopover}`}>
                              <strong>Модерация</strong>
                              <button type="button" onClick={() => void moderate(message, 'delete')}>Удалить сообщение</button>
                              <button type="button" onClick={() => void moderate(message, 'mute10')}>Mute 10 минут</button>
                              <button type="button" onClick={() => void moderate(message, 'mute60')}>Mute 1 час</button>
                              <button type="button" onClick={() => void moderate(message, 'mute1440')}>Mute 24 часа</button>
                              {me && me.role !== 'moderator' && <button type="button" className={styles.dangerAction} onClick={() => void moderate(message, 'ban')}>Ban пользователя</button>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </div>

        {hasNewBelow && <button type="button" className={styles.newMessages} onClick={() => { scrollToBottom(); markSeenSoon(); }}>Новые сообщения ↓</button>}

        <div className={styles.composerWrap}>
          {notice && <button type="button" className={styles.notice} onClick={() => setNotice('')}>{notice}</button>}
          {error && <button type="button" className={styles.error} onClick={() => setError('')}>{error}</button>}

          {!authLoading && !user ? (
            <div className={styles.authGate}>
              <div><strong>Присоединяйся к разговору</strong><span>Читать чат можно без аккаунта. Для сообщений нужно войти.</span></div>
              <div><Link href="/login">Войти</Link><Link href="/register">Регистрация</Link></div>
            </div>
          ) : restricted ? (
            <div className={styles.restricted}><strong>{me?.restriction.status === 'banned' ? 'Публикация сообщений заблокирована' : 'Чат временно ограничен'}</strong><span>{me?.restriction.expiresAt ? `До ${new Date(me.restriction.expiresAt).toLocaleString('ru-RU')}` : 'Без срока'}</span></div>
          ) : (
            <form className={styles.composer} onSubmit={submitMessage}>
              {replyingTo && <div className={styles.replying}><span>Ответ <strong>@{replyingTo.author?.username || 'пользователь'}</strong><small>{replyingTo.body}</small></span><button type="button" onClick={() => setReplyingTo(null)}>×</button></div>}
              <div className={styles.composerRow}>
                <img src={composerAvatarUrl} alt="" className={styles.composerAvatar} style={avatarStyle(profile ? { id: profile.id, username: profile.username, avatarUrl: composerAvatarUrl, avatarTransform: profile.display_avatar_transform ?? null, sponsor: null, role: null, premium: false } : null)} />
                <textarea ref={composerRef} value={body} onChange={(event) => setBody(event.target.value.slice(0, 500))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={500} placeholder={cooldownSeconds ? `Slow mode · ещё ${cooldownSeconds} сек.` : 'Написать сообщение…'} disabled={authLoading || sending || !browserOnline || cooldownSeconds > 0} />
                <span className={styles.counter}>{body.length}/500</span>
                <button type="submit" className={styles.send} disabled={!body.trim() || sending || authLoading || !browserOnline || cooldownSeconds > 0}>{sending ? '…' : cooldownSeconds ? cooldownSeconds : '➤'}</button>
              </div>
              {settings.slowModeSeconds > 2 && <small className={styles.slowHint}>Slow mode: {settings.slowModeSeconds} сек. между сообщениями</small>}
            </form>
          )}
        </div>
      </section>

      <aside className={styles.sidePanel}>
        <div className={styles.sideCard}><span className={styles.sideEyebrow}>Сейчас</span><strong>{onlineCount || '—'} онлайн</strong><p>Presence работает только внутри /chat и не держит WebSocket на главной.</p></div>
        {user && <div className={styles.sideCard}><span className={styles.sideEyebrow}>Для тебя</span><strong>{me?.unreadNotifications || 0} уведомлений</strong>{me?.notifications?.length ? <div className={styles.notifications}>{me.notifications.slice(0,5).map((item) => <button key={item.id} type="button" onClick={() => document.getElementById(`chat-${item.messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><b>{item.type === 'mention' ? '@ Упоминание' : '↩ Ответ'} · {item.actorUsername}</b><span>{item.body}</span></button>)}</div> : <p>Новых ответов и упоминаний нет.</p>}</div>}
        <div className={styles.sideCard}><span className={styles.sideEyebrow}>Правила</span><ol><li>Без спама и флуда.</li><li>Без травли, угроз и 18+ контента.</li><li>Спойлеры помечай заранее.</li></ol><Link href="/terms">Правила AnimeBox →</Link></div>
        {me?.role && <div className={styles.sideCard}><span className={styles.sideEyebrow}>Модерация</span><strong>Community Admin</strong><p>Жалобы, mute/ban, slow mode и закреплённые сообщения.</p><Link href="/admin/community">Открыть панель →</Link></div>}
        <div className={styles.sideCard}><span className={styles.sideEyebrow}>Смотреть вместе</span><strong>Anime Party</strong><p>Хочешь не только обсуждать, но и смотреть вместе?</p><Link href="/watch-together">Открыть Watch Together →</Link></div>
      </aside>
    </div>
  );
}
