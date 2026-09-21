'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { trackProductClientEvent } from '@/lib/product-events-client';

type FriendCard = {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  direction: 'friend';
};

type FriendsResponse = {
  friends?: FriendCard[];
  error?: string;
};

export default function WatchPartyFriendInvite({
  inviteUrl,
  animeTitle,
  episode,
}: {
  inviteUrl: string;
  animeTitle: string;
  episode: number;
}) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || friends.length) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      void fetch('/api/friends', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as FriendsResponse;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить друзей.');
        if (!active) return;
        setFriends(payload.friends ?? []);
        setError('');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить друзей.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
    };
  }, [friends.length, open]);

  async function invite(friend: FriendCard) {
    if (busyId || sent.has(friend.userId)) return;
    setBusyId(friend.userId);
    setError('');

    try {
      const response = await fetch('/api/friends/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: friend.userId,
          inviteUrl,
          animeTitle,
          episode,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось отправить приглашение.');

      setSent((current) => new Set(current).add(friend.userId));
      trackProductClientEvent('watch_party_invite_shared', {
        source: 'watch_party',
        entityType: 'friend',
        entityId: friend.userId,
        metadata: {
          method: 'friend_notification',
          anime_title: animeTitle,
          episode,
        },
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить приглашение.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="min-h-9 rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-3 text-xs font-black text-violet-100"
      >
        Позвать друга
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+8px)] right-0 z-40 w-[300px] max-w-[82vw] rounded-2xl border border-violet-400/15 bg-[#0a0e19]/[0.98] p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <strong className="block text-sm text-white">Пригласить друзей</strong>
              <span className="text-[10px] text-slate-500">Уведомление появится в AnimeBox</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-white">×</button>
          </div>

          {loading ? (
            <div className="py-5 text-center text-xs text-slate-500">Загружаем друзей…</div>
          ) : friends.length ? (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {friends.map((friend) => {
                const wasSent = sent.has(friend.userId);
                return (
                  <div key={friend.userId} className="flex items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2">
                    <img src={friend.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-200">{friend.username}</span>
                    <button
                      type="button"
                      disabled={wasSent || busyId === friend.userId}
                      onClick={() => void invite(friend)}
                      className="rounded-lg border border-violet-400/15 bg-violet-500/10 px-2.5 py-1.5 text-[10px] font-black text-violet-100 disabled:opacity-55"
                    >
                      {wasSent ? 'Отправлено ✓' : busyId === friend.userId ? '…' : 'Позвать'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/8 p-4 text-center">
              <p className="text-xs text-slate-500">Сначала добавь друзей в AnimeBox.</p>
              <Link href="/friends" className="mt-2 inline-flex text-xs font-black text-violet-300">Открыть друзей →</Link>
            </div>
          )}

          {error && <p className="mt-2 text-[10px] font-bold text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
