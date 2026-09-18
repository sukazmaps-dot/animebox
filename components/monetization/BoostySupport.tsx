'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuthState } from '@/components/AuthStateProvider';

type Claim = {
  id: string;
  boostyName: string;
  amount: number;
  currency: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  transactionId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  adminNote: string | null;
};

type Payload = {
  configured?: boolean;
  supportUrl?: string | null;
  claims?: Claim[];
  claim?: Claim | null;
  error?: string;
};

export default function BoostySupport() {
  const { user } = useAuthState();
  const publicUrl = process.env.NEXT_PUBLIC_BOOSTY_URL?.trim() || '';
  const [claims, setClaims] = useState<Claim[]>([]);
  const [boostyName, setBoostyName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('RUB');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id || !publicUrl) return;
    let active = true;
    void fetch('/api/monetization/boosty/claim', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as Payload;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Boosty');
        if (active) setClaims(payload.claims ?? []);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить Boosty');
      });
    return () => { active = false; };
  }, [publicUrl, user?.id]);

  if (!publicUrl) return null;

  const latest = claims[0] ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/monetization/boosty/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ boostyName, amount: Number(amount), currency, note }),
        cache: 'no-store',
      });
      const payload = (await response.json()) as Payload;
      if (!response.ok || !payload.claim) throw new Error(payload.error || 'Не удалось отправить заявку');
      const next = payload.claim;
      setClaims((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setNote('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="support-box__section support-box__web-only boosty-support">
      <div className="boosty-support__head">
        <div>
          <span>BOOSTY</span>
          <strong>Поддержать через Boosty</strong>
          <p>Оплата проходит на стороне Boosty. После платежа отправь короткую заявку — администратор сверит её с кабинетом Boosty и привяжет к твоему AnimeBox-профилю.</p>
        </div>
        <a className="btn btn--ghost" href={publicUrl} target="_blank" rel="noreferrer">Открыть Boosty ↗</a>
      </div>

      {!user?.id ? (
        <p className="boosty-support__notice">Войди в AnimeBox, чтобы Boosty-платёж можно было привязать к твоему профилю.</p>
      ) : latest?.status === 'approved' ? (
        <div className="boosty-support__success" role="status">
          <strong>✓ Boosty-платёж подтверждён</strong>
          <span>{latest.amount.toLocaleString('ru-RU')} {latest.currency} · {latest.boostyName}</span>
        </div>
      ) : (
        <form className="boosty-support__form" onSubmit={submit}>
          {latest?.status === 'pending' && <div className="boosty-support__pending">Последняя заявка на {latest.amount.toLocaleString('ru-RU')} {latest.currency} сейчас на ручной проверке.</div>}
          {latest?.status === 'rejected' && <div className="boosty-support__notice is-error">Последняя заявка не подтверждена{latest.adminNote ? `: ${latest.adminNote}` : '.'}</div>}

          <label><span>Имя на Boosty</span><input value={boostyName} onChange={(event) => setBoostyName(event.target.value)} placeholder="Ник / имя плательщика" maxLength={80} required /></label>
          <div className="boosty-support__amount-row">
            <label><span>Сумма</span><input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100" required /></label>
            <label><span>Валюта</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="RUB">RUB</option><option value="KZT">KZT</option><option value="USD">USD</option></select></label>
          </div>
          <label><span>Комментарий для сверки · необязательно</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Например: оплатил только что" maxLength={500} /></label>
          <button className="btn btn--ghost" type="submit" disabled={busy}>{busy ? 'Отправляем…' : latest?.status === 'pending' ? 'Отправить новую заявку' : 'Я оплатил · отправить на проверку'}</button>
        </form>
      )}

      {error && <div className="boosty-support__notice is-error" role="alert">{error}</div>}
      <small className="boosty-support__muted">Boosty-донаты учитываются отдельно от Telegram Stars. AnimeBox не запрашивает пароль, cookie или платёжные данные Boosty.</small>
    </section>
  );
}
