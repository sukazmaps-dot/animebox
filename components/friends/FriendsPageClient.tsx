'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import ProfilePreview from '@/components/profile/ProfilePreview';
import { useAuthState } from '@/components/AuthStateProvider';
import { notifySocialNotificationsChanged } from '@/components/SocialNotificationBadge';
import SocialGraphPanels from '@/components/friends/SocialGraphPanels';
import {
  FRIENDS_CHANGED_EVENT,
  notifyFriendsChanged,
} from '@/lib/friends-events';

type FriendCard = {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  status: 'accepted' | 'pending';
  direction: 'incoming' | 'outgoing' | 'friend';
  createdAt: string;
  acceptedAt: string | null;
  online: boolean;
};

type FriendsResponse = {
  friends?: FriendCard[];
  incoming?: FriendCard[];
  outgoing?: FriendCard[];
  error?: string;
};

function PersonCard({
  item,
  action,
  secondaryAction,
}: {
  item: FriendCard;
  action?: { label: string; onClick: () => void; primary?: boolean };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
      <ProfilePreview
        userId={item.userId}
        username={item.username}
        className="shrink-0"
      >
        <span className="relative block h-12 w-12">
          <img
            src={item.avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full border border-violet-400/15 object-cover"
          />
          {item.online && item.direction === 'friend' && (
            <span
              className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#090d18] bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.35)]"
              title="В сети"
              aria-label="В сети"
            />
          )}
        </span>
      </ProfilePreview>
      <div className="min-w-0 flex-1">
        <ProfilePreview
          userId={item.userId}
          username={item.username}
          className="block max-w-full truncate text-sm font-black text-slate-100 hover:text-violet-200"
        >
          {item.username}
        </ProfilePreview>
        <span className="text-[11px] font-semibold text-slate-500">
          {item.direction === 'friend'
            ? item.online
              ? 'В сети · друг AnimeBox'
              : 'Друг AnimeBox'
            : item.direction === 'incoming'
              ? 'Хочет добавить тебя в друзья'
              : 'Ожидает ответа'}
        </span>
      </div>
      {(action || secondaryAction) && (
        <div className="flex shrink-0 gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={`min-h-9 rounded-xl px-3 text-xs font-black ${
                action.primary
                  ? 'border border-violet-400/25 bg-violet-500/15 text-violet-100'
                  : 'border border-white/10 bg-white/[0.035] text-slate-300'
              }`}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="min-h-9 rounded-xl border border-white/8 bg-transparent px-3 text-xs font-bold text-slate-500 hover:text-rose-300"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default function FriendsPageClient() {
  const { user, loading: authLoading } = useAuthState();
  const [data, setData] = useState<Required<Pick<FriendsResponse, 'friends' | 'incoming' | 'outgoing'>>>({
    friends: [],
    incoming: [],
    outgoing: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await fetch('/api/friends', { cache: 'no-store' });
      const payload = (await response.json()) as FriendsResponse;
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить друзей.');
      setData({
        friends: payload.friends ?? [],
        incoming: payload.incoming ?? [],
        outgoing: payload.outgoing ?? [],
      });
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить друзей.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    queueMicrotask(() => void load());
  }, [authLoading, load, user]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(FRIENDS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FRIENDS_CHANGED_EVENT, refresh);
  }, [load]);

  async function patch(friendshipId: string, action: 'accept' | 'decline' | 'cancel') {
    const response = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId, action }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || 'Не удалось обновить заявку.');
      return;
    }
    notifySocialNotificationsChanged();
    notifyFriendsChanged();
    await load();
  }

  async function remove(userId: string) {
    const response = await fetch(`/api/friends?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || 'Не удалось удалить друга.');
      return;
    }
    notifyFriendsChanged();
    await load();
  }

  if (authLoading || loading) {
    return <div className="grid min-h-[55vh] place-items-center"><AnimeBoxLoader label="Загружаем друзей…" size={52} /></div>;
  }

  if (!user) {
    return (
      <section className="mx-auto max-w-3xl rounded-3xl border border-white/[0.07] bg-white/[0.025] p-8 text-center">
        <h1 className="text-3xl font-black text-white">Друзья AnimeBox</h1>
        <p className="mt-3 text-sm text-slate-400">Войди, чтобы добавлять друзей и приглашать их в Watch Together.</p>
        <Link href="/login?next=/friends" className="mt-5 inline-flex rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white">Войти</Link>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-3xl border border-violet-400/10 bg-[radial-gradient(circle_at_15%_0%,rgba(124,92,255,.16),transparent_35%),rgba(8,12,22,.75)] p-6 sm:p-8">
        <span className="text-[10px] font-black tracking-[.16em] text-violet-300">SOCIAL GRAPH · 17.7</span>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Друзья AnimeBox</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Добавляй знакомых, следи за заявками и приглашай друзей в совместный просмотр.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-slate-300">
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Друзей · {data.friends.length}</span>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Входящих · {data.incoming.length}</span>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">Исходящих · {data.outgoing.length}</span>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-500/[0.06] p-4 text-sm font-bold text-rose-200">{error}</div>}

      <SocialGraphPanels />

      {data.incoming.length > 0 && (
        <section className="rounded-3xl border border-white/[0.06] bg-[#090d18]/80 p-5 sm:p-6">
          <div className="mb-4">
            <span className="text-[9px] font-black tracking-[.14em] text-violet-300">ВХОДЯЩИЕ</span>
            <h2 className="mt-1 text-xl font-black text-white">Заявки в друзья</h2>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.incoming.map((item) => (
              <PersonCard
                key={item.friendshipId}
                item={item}
                action={{ label: 'Принять', primary: true, onClick: () => void patch(item.friendshipId, 'accept') }}
                secondaryAction={{ label: 'Отклонить', onClick: () => void patch(item.friendshipId, 'decline') }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-white/[0.06] bg-[#090d18]/80 p-5 sm:p-6">
        <div className="mb-4">
          <span className="text-[9px] font-black tracking-[.14em] text-violet-300">ТВОЙ КРУГ</span>
          <h2 className="mt-1 text-xl font-black text-white">Друзья</h2>
        </div>
        {data.friends.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {data.friends.map((item) => (
              <PersonCard
                key={item.friendshipId}
                item={item}
                secondaryAction={{ label: 'Удалить', onClick: () => void remove(item.userId) }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/8 p-8 text-center">
            <strong className="text-sm text-slate-200">Пока никого</strong>
            <p className="mt-1 text-xs text-slate-500">Открой публичный профиль пользователя и нажми «Добавить в друзья».</p>
          </div>
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section className="rounded-3xl border border-white/[0.06] bg-[#090d18]/80 p-5 sm:p-6">
          <div className="mb-4">
            <span className="text-[9px] font-black tracking-[.14em] text-violet-300">ОЖИДАНИЕ</span>
            <h2 className="mt-1 text-xl font-black text-white">Отправленные заявки</h2>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.outgoing.map((item) => (
              <PersonCard
                key={item.friendshipId}
                item={item}
                action={{ label: 'Отменить', onClick: () => void patch(item.friendshipId, 'cancel') }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
