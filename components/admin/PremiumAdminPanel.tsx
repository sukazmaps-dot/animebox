'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Subscription = {
  id: string;
  user_id: string;
  plan: 'monthly' | 'yearly' | 'manual';
  status: 'active' | 'grace_period' | 'expired' | 'cancelled' | 'refunded';
  source: string;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  created_at: string;
};

type Data = {
  now: string;
  subscriptions: Subscription[];
  profiles: { id: string; username: string | null }[];
  matches?: { id: string; username: string | null }[];
};

export default function PremiumAdminPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ id: string; username: string | null }[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('Тестовый / ручной Premium grant');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  async function load() {
    const response = await fetch('/api/admin/premium', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Premium');
    setData(payload as Data);
  }

  useEffect(() => {
    let active = true;
    void load().catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить Premium');
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const profileMap = useMemo(
    () => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile.username || profile.id])),
    [data?.profiles],
  );

  async function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy('search');
    setError('');
    try {
      const response = await fetch(`/api/admin/premium?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Поиск не выполнен');
      setMatches(payload.matches ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Поиск не выполнен');
    } finally {
      setBusy('');
    }
  }

  async function grant() {
    if (!selectedUser) return;
    setBusy('grant');
    setError('');
    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          userId: selectedUser,
          days: Number(days),
          reason,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Premium не выдан');
      setRefresh((value) => value + 1);
      setMatches([]);
      setSelectedUser('');
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Premium не выдан');
    } finally {
      setBusy('');
    }
  }

  async function revoke(subscription: Subscription) {
    const note = window.prompt('Причина отключения Premium:', 'Ручное отключение администратором') ?? '';
    if (!note.trim()) return;
    setBusy(`revoke:${subscription.id}`);
    setError('');
    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', subscriptionId: subscription.id, reason: note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Premium не отключён');
      setRefresh((value) => value + 1);
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Premium не отключён');
    } finally {
      setBusy('');
    }
  }

  const now = Date.parse(data?.now ?? new Date().toISOString());
  const active = (data?.subscriptions ?? []).filter(
    (subscription) =>
      ['active', 'grace_period'].includes(subscription.status) &&
      Date.parse(subscription.ends_at) > now,
  );

  return (
    <section className="premium-admin">
      <div className="premium-admin__head">
        <div>
          <span>PREMIUM V1</span>
          <h2>AnimeBox Premium</h2>
          <p>Ручные grants для тестирования entitlement-слоя до подключения checkout.</p>
        </div>
        <Link href="/premium">Открыть Premium →</Link>
      </div>

      <form className="premium-admin__search" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ник или UUID пользователя" />
        <button type="submit" disabled={busy === 'search'}>{busy === 'search' ? 'Ищем…' : 'Найти'}</button>
      </form>

      {matches.length > 0 && (
        <div className="premium-admin__matches">
          {matches.map((profile) => (
            <button
              key={profile.id}
              type="button"
              data-selected={selectedUser === profile.id}
              onClick={() => setSelectedUser(profile.id)}
            >
              <strong>{profile.username || 'Без ника'}</strong>
              <small>{profile.id}</small>
            </button>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="premium-admin__grant">
          <label>
            <span>Срок, дней</span>
            <input type="number" min="1" max="3660" value={days} onChange={(event) => setDays(event.target.value)} />
          </label>
          <label>
            <span>Причина</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </label>
          <button type="button" disabled={busy === 'grant'} onClick={() => void grant()}>
            {busy === 'grant' ? 'Выдаём…' : 'Выдать Premium'}
          </button>
        </div>
      )}

      {error && <p className="sponsor-v25-error" role="alert">{error}</p>}

      <div className="sponsor-v2-table sponsor-v25-table">
        <table>
          <thead><tr><th>Пользователь</th><th>План</th><th>Источник</th><th>До</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {active.map((subscription) => (
              <tr key={subscription.id}>
                <td>
                  <Link className="sponsor-v2-profile-link" href={`/profile/${subscription.user_id}`}>
                    {profileMap.get(subscription.user_id) || subscription.user_id} <span aria-hidden="true">↗</span>
                  </Link>
                </td>
                <td>{subscription.plan}</td>
                <td>{subscription.source}</td>
                <td>{new Date(subscription.ends_at).toLocaleString('ru-RU')}</td>
                <td><span className="sponsor-v25-status" data-status={subscription.status}>{subscription.status}</span></td>
                <td>
                  <button
                    className="is-danger"
                    disabled={Boolean(busy)}
                    onClick={() => void revoke(subscription)}
                  >
                    {busy === `revoke:${subscription.id}` ? 'Отключаем…' : 'Отключить'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!active.length && <p>Активных Premium-подписок пока нет.</p>}
      </div>
    </section>
  );
}
