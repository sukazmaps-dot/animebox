'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Claim = {
  id: string; user_id: string; boosty_name: string; amount: number | string; currency: string;
  note: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  transaction_id: string | null; created_at: string; resolved_at: string | null; admin_note: string | null;
};
type Data = { configured: boolean; supportUrl: string | null; claims: Claim[]; profiles: { id: string; username: string | null }[] };

export default function BoostyClaimsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/monetization/boosty', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Boosty');
        if (active) setData(payload as Data);
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить Boosty'); });
    return () => { active = false; };
  }, [refresh]);

  const profiles = useMemo(() => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile.username || profile.id])), [data?.profiles]);

  async function action(claim: Claim, type: 'approve' | 'reject') {
    const note = type === 'reject'
      ? window.prompt('Причина отклонения:', 'Платёж не найден в кабинете Boosty') ?? ''
      : window.prompt('Заметка администратора · необязательно:', '') ?? '';
    if (type === 'reject' && !note.trim()) return;

    setBusy(`${type}:${claim.id}`);
    setError('');
    try {
      const response = await fetch('/api/admin/monetization/boosty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, claimId: claim.id, adminNote: note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Действие не выполнено');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Действие не выполнено');
    } finally {
      setBusy('');
    }
  }

  const pending = data?.claims.filter((claim) => claim.status === 'pending') ?? [];
  const recent = data?.claims.filter((claim) => claim.status !== 'pending').slice(0, 15) ?? [];

  return (
    <section className="boosty-admin">
      <div className="boosty-admin__head">
        <div>
          <h2>Boosty · ручная верификация</h2>
          <p>{data?.configured ? 'Пользователь сообщает данные платежа, администратор сверяет их в Boosty и подтверждает.' : 'Добавь NEXT_PUBLIC_BOOSTY_URL в Vercel, чтобы показать Boosty на странице поддержки.'}</p>
        </div>
        {data?.supportUrl && <a href={data.supportUrl} target="_blank" rel="noreferrer">Открыть Boosty ↗</a>}
      </div>
      {error && <p className="sponsor-v25-error" role="alert">{error}</p>}
      <div className="sponsor-v2-table sponsor-v25-table">
        <table>
          <thead><tr><th>Дата</th><th>Пользователь</th><th>Boosty</th><th>Сумма</th><th>Комментарий</th><th>Действия</th></tr></thead>
          <tbody>{pending.map((claim) => (
            <tr key={claim.id}>
              <td>{new Date(claim.created_at).toLocaleString('ru-RU')}</td>
              <td><Link className="sponsor-v2-profile-link" href={`/profile/${claim.user_id}`}>{profiles.get(claim.user_id) || claim.user_id} <span aria-hidden="true">↗</span></Link></td>
              <td>{claim.boosty_name}</td>
              <td>{Number(claim.amount).toLocaleString('ru-RU')} {claim.currency}</td>
              <td>{claim.note || '—'}</td>
              <td><div className="sponsor-v25-row-actions">
                <button disabled={Boolean(busy)} onClick={() => void action(claim, 'approve')}>{busy === `approve:${claim.id}` ? 'Подтверждаем…' : 'Подтвердить'}</button>
                <button className="is-danger" disabled={Boolean(busy)} onClick={() => void action(claim, 'reject')}>{busy === `reject:${claim.id}` ? 'Отклоняем…' : 'Отклонить'}</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
        {!pending.length && <p>Новых Boosty-заявок нет.</p>}
      </div>
      {recent.length > 0 && <div className="boosty-admin__recent"><strong>Последние обработанные</strong><div>{recent.map((claim) => <span key={claim.id} data-status={claim.status}>{claim.boosty_name} · {Number(claim.amount).toLocaleString('ru-RU')} {claim.currency} · {claim.status}</span>)}</div></div>}
    </section>
  );
}
