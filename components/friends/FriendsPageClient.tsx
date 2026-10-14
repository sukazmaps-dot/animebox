'use client';

import Link from 'next/link';
import styles from './FriendsPageClient.module.css';
import { useCallback, useEffect, useState } from 'react';

import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import UserIdentity from '@/components/identity/UserIdentity';
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
  premium: boolean;
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
    <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--ab-ui-border)] bg-[var(--ab-ui-surface)] p-3 transition-colors hover:bg-[var(--ab-ui-raised)]">
      <ProfilePreview
        userId={item.userId}
        username={item.username}
        className="shrink-0"
      >
        <span className="relative block h-12 w-12">
          <img
            src={item.avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full border border-[color-mix(in_srgb,var(--ab-ui-accent)_15%,transparent)] object-cover"
          />
          {item.online && item.direction === 'friend' && (
            <span
              className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--ab-ui-surface)] bg-emerald-400 shadow-[0_0_10px_color-mix(in_srgb,_var(--ab-ui-success)_35%,_transparent)]"
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
          className="block max-w-full truncate text-sm font-black text-[var(--ab-ui-text)] hover:text-[var(--ab-ui-accent)]"
        >
          <UserIdentity
            username={item.username}
            premium={item.premium}
            compact
          />
        </ProfilePreview>
        <span className="text-[11px] font-semibold text-[var(--ab-ui-muted)]">
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
                  ? 'border border-[var(--ab-ui-accent)] bg-[var(--ab-ui-selected)] text-[var(--ab-ui-text)]'
                  : 'border border-white/10 bg-white/[0.035] text-[var(--ab-ui-muted)]'
              }`}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="min-h-9 rounded-xl border border-[var(--ab-ui-border)] bg-transparent px-3 text-xs font-bold text-[var(--ab-ui-muted)] hover:text-rose-300"
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
      <section className="mx-auto max-w-3xl rounded-3xl border border-[var(--ab-ui-border)] bg-[var(--ab-ui-surface)] p-8 text-center">
        <h1 className="text-3xl font-black text-[var(--ab-ui-text)]">Друзья AnimeBox</h1>
        <p className="mt-3 text-sm text-[var(--ab-ui-muted)]">Войди, чтобы добавлять друзей и приглашать их в Watch Together.</p>
        <Link href="/login?next=/friends" className="mt-5 inline-flex rounded-xl bg-[var(--ab-ui-primary)] px-5 py-3 text-sm font-black text-[var(--ab-ui-primary-text)]">Войти</Link>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <header className="rounded-3xl border border-[var(--ab-ui-border)] bg-[var(--ab-ui-surface)] p-6 sm:p-8">
        <span className="text-[10px] font-black tracking-[.16em] text-[var(--ab-ui-accent)]">SOCIAL GRAPH · 17.7</span>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--ab-ui-text)] sm:text-4xl">Друзья AnimeBox</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ab-ui-muted)]">
          Добавляй знакомых, следи за заявками и приглашай друзей в совместный просмотр.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-[var(--ab-ui-muted)]">
          <span className="rounded-full border border-[var(--ab-ui-border)] bg-white/[0.03] px-3 py-1.5">Друзей · {data.friends.length}</span>
          <span className="rounded-full border border-[var(--ab-ui-border)] bg-white/[0.03] px-3 py-1.5">Входящих · {data.incoming.length}</span>
          <span className="rounded-full border border-[var(--ab-ui-border)] bg-white/[0.03] px-3 py-1.5">Исходящих · {data.outgoing.length}</span>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-500/[0.06] p-4 text-sm font-bold text-rose-200">{error}</div>}

      <div className={styles.discovery}><SocialGraphPanels /></div>

      {data.incoming.length > 0 && (
        <section className={styles.panel}>
          <div className="mb-4">
            <span className="text-[9px] font-black tracking-[.14em] text-[var(--ab-ui-accent)]">ВХОДЯЩИЕ</span>
            <h2 className="mt-1 text-xl font-black text-[var(--ab-ui-text)]">Заявки в друзья</h2>
          </div>
          <div className={styles.people}>
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

      <section className={styles.panel}>
        <div className="mb-4">
          <span className="text-[9px] font-black tracking-[.14em] text-[var(--ab-ui-accent)]">ТВОЙ КРУГ</span>
          <h2 className="mt-1 text-xl font-black text-[var(--ab-ui-text)]">Друзья</h2>
        </div>
        {data.friends.length ? (
          <div className={styles.people}>
            {data.friends.map((item) => (
              <PersonCard
                key={item.friendshipId}
                item={item}
                secondaryAction={{ label: 'Удалить', onClick: () => void remove(item.userId) }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--ab-ui-border)] p-8 text-center">
            <strong className="text-sm text-[var(--ab-ui-text)]">Пока никого</strong>
            <p className="mt-1 text-xs text-[var(--ab-ui-muted)]">Открой публичный профиль пользователя и нажми «Добавить в друзья».</p>
          </div>
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section className={styles.panel}>
          <div className="mb-4">
            <span className="text-[9px] font-black tracking-[.14em] text-[var(--ab-ui-accent)]">ОЖИДАНИЕ</span>
            <h2 className="mt-1 text-xl font-black text-[var(--ab-ui-text)]">Отправленные заявки</h2>
          </div>
          <div className={styles.people}>
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
