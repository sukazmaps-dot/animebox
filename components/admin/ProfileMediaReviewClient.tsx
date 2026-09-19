'use client';

import { useCallback, useEffect, useState } from 'react';

type ReviewMedia = {
  id: string;
  variant: 'original' | 'static';
  signedUrl: string | null;
  mime_type: string | null;
  animated: boolean | null;
  reason: string | null;
  categories: Record<string, boolean> | null;
  category_scores: Record<string, number> | null;
};

type ReviewGroup = {
  id: string;
  user_id: string;
  username: string;
  scope: 'base' | 'premium';
  kind: 'avatar' | 'banner';
  status: string;
  created_at: string;
  media: ReviewMedia[];
};

export default function ProfileMediaReviewClient() {
  const [groups, setGroups] = useState<ReviewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/community/media', { cache: 'no-store' });
      const payload = (await response.json()) as { groups?: ReviewGroup[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить очередь.');
      setGroups(payload.groups ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить очередь.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(groupId: string, action: 'approve' | 'reject') {
    setBusy(groupId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/community/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, action }),
      });
      const payload = (await response.json()) as { error?: string; stale?: boolean };
      if (!response.ok) throw new Error(payload.error || 'Не удалось обработать заявку.');
      setGroups((current) => current.filter((item) => item.id !== groupId));
      setMessage(
        payload.stale
          ? 'Файл одобрен, но пользователь уже сменил оформление — старое состояние не перезаписано.'
          : action === 'approve'
            ? 'Изображение одобрено и применено.'
            : 'Изображение отклонено.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось обработать заявку.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">Загружаем очередь…</div>;
  }

  return (
    <div className="space-y-5">
      {message && (
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-4 py-3 text-sm text-violet-100/85">
          {message}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/45">
          Очередь чистая — сомнительных аватаров и баннеров нет.
        </div>
      ) : (
        groups.map((group) => {
          const original = group.media.find((item) => item.variant === 'original') ?? group.media[0];
          const topScores = Object.entries(original?.category_scores ?? {})
            .filter(([, value]) => Number(value) >= 0.08)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 5);

          return (
            <article key={group.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#090d18] shadow-[0_20px_55px_rgba(0,0,0,.2)]">
              <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="grid min-h-[260px] place-items-center bg-black/35 p-4">
                  {original?.signedUrl ? (
                    <img
                      src={original.signedUrl}
                      alt="Медиа на модерации"
                      className={`max-h-[340px] max-w-full object-contain ${group.kind === 'avatar' ? 'rounded-3xl' : 'rounded-xl'}`}
                    />
                  ) : (
                    <span className="text-xs text-white/35">Предпросмотр недоступен</span>
                  )}
                </div>

                <div className="flex flex-col gap-5 p-5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300/55">PROFILE MEDIA REVIEW</span>
                    <h2 className="mt-2 text-lg font-black text-white">{group.username}</h2>
                    <p className="mt-1 text-sm text-white/45">
                      {group.scope === 'premium' ? 'Premium' : 'Обычный профиль'} · {group.kind === 'avatar' ? 'аватар' : 'баннер'}
                      {original?.animated ? ' · анимация' : ''}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs text-white/55">
                    <strong className="block text-white/80">Причина проверки</strong>
                    <span className="mt-1 block">{original?.reason || 'borderline_profile_media'}</span>
                    {topScores.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {topScores.map(([name, score]) => (
                          <span key={name} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
                            {name}: {(Number(score) * 100).toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy === group.id}
                      onClick={() => void act(group.id, 'approve')}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Одобрить
                    </button>
                    <button
                      type="button"
                      disabled={busy === group.id}
                      onClick={() => void act(group.id, 'reject')}
                      className="rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-4 py-2.5 text-sm font-bold text-rose-100 disabled:opacity-50"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
