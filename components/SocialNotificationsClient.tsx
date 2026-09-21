'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';

type SocialNotification = {
  id: number;
  type:
    | 'friend_request'
    | 'friend_accepted'
    | 'watch_party_invite'
    | 'ranking_overtaken'
    | 'ranking_entered_top10';
  createdAt: string;
  readAt: string | null;
  payload: Record<string, unknown>;
  actor: {
    id: string;
    username: string;
    avatarUrl: string;
  } | null;
};

type ResponsePayload = {
  notifications?: SocialNotification[];
  unread?: number;
  error?: string;
};

function messageFor(item: SocialNotification) {
  const actor = item.actor?.username || 'Пользователь';

  if (item.type === 'friend_request') {
    return {
      title: 'Новая заявка в друзья',
      text: `${actor} хочет добавить тебя в друзья.`,
    };
  }
  if (item.type === 'friend_accepted') {
    return {
      title: 'Теперь вы друзья',
      text: `${actor} принял твою заявку.`,
    };
  }
  if (item.type === 'watch_party_invite') {
    const animeTitle =
      typeof item.payload.animeTitle === 'string' && item.payload.animeTitle.trim()
        ? item.payload.animeTitle.trim()
        : 'аниме';
    const episode = Number(item.payload.episode);
    return {
      title: 'Приглашение в Watch Together',
      text: Number.isSafeInteger(episode) && episode > 0
        ? `${actor} зовёт смотреть «${animeTitle}» · серия ${episode}.`
        : `${actor} зовёт тебя в совместный просмотр.`,
    };
  }
  if (item.type === 'ranking_overtaken') {
    return {
      title: 'Изменение в рейтинге',
      text: `${actor} обогнал тебя в лидерборде AnimeBox.`,
    };
  }
  return {
    title: 'Ты в топ-10',
    text: 'Ты поднялся в топ-10 рейтинга AnimeBox.',
  };
}

function targetFor(item: SocialNotification) {
  if (item.type === 'friend_request') return '/friends';
  if (item.type === 'friend_accepted' && item.actor) return `/profile/${item.actor.id}`;
  if (item.type === 'watch_party_invite') {
    return typeof item.payload.inviteUrl === 'string'
      ? item.payload.inviteUrl
      : '/watch-together';
  }
  return '/leaderboard';
}

function timeLabel(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export default function SocialNotificationsClient() {
  const { user, loading: authLoading } = useAuthState();
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const unread = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items],
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch('/api/social/notifications?limit=30', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as ResponsePayload;
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить уведомления.');
      setItems(payload.notifications ?? []);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить уведомления.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, load, user]);

  async function markRead(ids?: number[]) {
    if (!user) return;
    await fetch('/api/social/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids?.length ? { ids } : { all: true }),
    }).catch(() => undefined);

    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) =>
        !ids?.length || ids.includes(item.id)
          ? { ...item, readAt: item.readAt ?? now }
          : item,
      ),
    );
  }

  if (!user || (loading && items.length === 0)) return null;

  return (
    <section className="mb-6 rounded-3xl border border-violet-400/10 bg-[radial-gradient(circle_at_10%_0%,rgba(122,92,255,.12),transparent_34%),rgba(8,12,22,.72)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[9px] font-black tracking-[.14em] text-violet-300">SOCIAL</span>
          <h2 className="mt-1 text-xl font-black text-white">Социальные уведомления</h2>
          <p className="mt-1 text-xs text-slate-500">Друзья, Watch Together и события рейтинга.</p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void markRead()}
            className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
          >
            Прочитать все · {unread}
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-xs font-bold text-rose-300">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/8 p-6 text-center">
          <strong className="text-sm text-slate-300">Пока тихо</strong>
          <p className="mt-1 text-xs text-slate-500">Заявки в друзья и приглашения появятся здесь.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-2">
          {items.map((item) => {
            const copy = messageFor(item);
            const href = targetFor(item);
            return (
              <Link
                key={item.id}
                href={href}
                onClick={() => {
                  if (!item.readAt) void markRead([item.id]);
                }}
                className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-px ${
                  item.readAt
                    ? 'border-white/[0.05] bg-white/[0.018]'
                    : 'border-violet-400/15 bg-violet-500/[0.055]'
                }`}
              >
                {item.actor ? (
                  <img
                    src={item.actor.avatarUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-violet-400/15 bg-violet-500/10 text-lg text-violet-200">✦</span>
                )}
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-black text-slate-100">{copy.title}</strong>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{copy.text}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-slate-600">{timeLabel(item.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
