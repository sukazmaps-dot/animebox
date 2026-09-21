'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import { notifySocialNotificationsChanged } from '@/components/SocialNotificationBadge';

type FriendshipState =
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'accepted';

type StatusResponse = {
  state?: FriendshipState;
  friendshipId?: string | null;
  error?: string;
};

export default function FriendActionButton({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const { user, loading } = useAuthState();
  const [state, setState] = useState<FriendshipState>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || user.id === targetUserId) {
      queueMicrotask(() => setReady(true));
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void fetch(`/api/friends?userId=${encodeURIComponent(targetUserId)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = (await response.json()) as StatusResponse;
        if (!response.ok) throw new Error(payload.error || 'Не удалось проверить дружбу.');
        if (!active) return;
        setState(payload.state ?? 'none');
        setFriendshipId(payload.friendshipId ?? null);
        setReady(true);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Не удалось проверить дружбу.');
        setReady(true);
      });
    });

    return () => {
      active = false;
    };
  }, [loading, targetUserId, user]);

  if (loading || !ready) {
    return <div className="h-10 w-36 animate-pulse rounded-xl bg-white/[0.04]" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/profile/${targetUserId}`)}`}
        className="inline-flex min-h-10 items-center rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 text-sm font-bold text-violet-100"
      >
        Войти, чтобы добавить
      </Link>
    );
  }

  if (user.id === targetUserId) return null;

  async function requestFriend() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      const payload = (await response.json()) as StatusResponse;
      if (!response.ok) throw new Error(payload.error || 'Не удалось отправить заявку.');
      setState(payload.state ?? 'pending_outgoing');
      setFriendshipId(payload.friendshipId ?? friendshipId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить заявку.');
    } finally {
      setBusy(false);
    }
  }

  async function act(action: 'accept' | 'decline' | 'cancel') {
    if (!friendshipId || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId, action }),
      });
      const payload = (await response.json()) as StatusResponse;
      if (!response.ok) throw new Error(payload.error || 'Не удалось обновить заявку.');
      setState(payload.state ?? 'none');
      if ((payload.state ?? 'none') === 'none') setFriendshipId(null);
      notifySocialNotificationsChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось обновить заявку.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFriend() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/friends?userId=${encodeURIComponent(targetUserId)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as StatusResponse;
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить из друзей.');
      setState('none');
      setFriendshipId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось удалить из друзей.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      {state === 'none' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void requestFriend()}
          className="min-h-10 rounded-xl border border-violet-400/25 bg-violet-500/12 px-4 text-sm font-black text-violet-100 transition hover:-translate-y-px hover:border-violet-300/40 disabled:opacity-50"
        >
          {busy ? 'Отправляем…' : '+ Добавить в друзья'}
        </button>
      )}

      {state === 'pending_outgoing' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act('cancel')}
          className="min-h-10 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-slate-300 disabled:opacity-50"
        >
          {busy ? 'Отменяем…' : 'Заявка отправлена · отменить'}
        </button>
      )}

      {state === 'pending_incoming' && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('accept')}
            className="min-h-10 rounded-xl border border-violet-400/25 bg-violet-500/15 px-4 text-sm font-black text-violet-100 disabled:opacity-50"
          >
            Принять заявку
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('decline')}
            className="min-h-10 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-bold text-slate-400 disabled:opacity-50"
          >
            Отклонить
          </button>
        </>
      )}

      {state === 'accepted' && (
        <>
          <Link
            href="/friends"
            className="inline-flex min-h-10 items-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 text-sm font-black text-emerald-200"
          >
            ✓ В друзьях
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void removeFriend()}
            className="min-h-10 rounded-xl border border-white/8 bg-transparent px-3 text-xs font-bold text-slate-500 hover:text-rose-300 disabled:opacity-50"
          >
            Удалить
          </button>
        </>
      )}

      {error && <span className="basis-full text-xs font-semibold text-rose-300">{error}</span>}
    </div>
  );
}
