'use client';

import { useEffect, useState } from 'react';
import styles from './LeaderboardHealthPanel.module.css';

type Period = { periodType: string; periodKey: string };
type Snapshot = {
  health: { coveredFrom: string; calculationVersion: string };
  lastJob: { status: string; started_at: string } | null;
  missing: Period[];
  partial: Array<{ period_type: string; period_key: string }>;
  periods: Period[];
  preview: null | { complete: boolean; entries: Array<{ place: number; username: string; active_ms: number }> };
};

export default function LeaderboardHealthPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/leaderboard-health', { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Не удалось получить состояние рейтинга'); return response.json(); })
      .then(setData).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  async function preview() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/leaderboard-health?preview=${encodeURIComponent(period)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось проверить период');
      setData(await response.json());
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка проверки'); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>Состояние рейтинга и архивов</h2>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Загрузка…</p>}
    {data && <>
      <p>Полная история с {new Date(data.health.coveredFrom).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} UTC · {data.health.calculationVersion}</p>
      <p>Последнее задание: {data.lastJob ? `${data.lastJob.status} · ${new Date(data.lastJob.started_at).toLocaleString('ru-RU')}` : 'нет запусков'}</p>
      <p role="status">Пропущено: {data.missing.length}. Неполных архивов: {data.partial.length}.</p>
      {[...data.missing.map(p => `${p.periodType}:${p.periodKey}`), ...data.partial.map(p => `${p.period_type}:${p.period_key}`)].map(key => <div key={key}>{key}</div>)}
      <label>Проверить расчёт завершённого периода
        <select value={period} onChange={event => setPeriod(event.target.value)}>
          <option value="">Выбери период</option>
          {data.periods.slice(-100).reverse().map(p => <option key={`${p.periodType}:${p.periodKey}`} value={`${p.periodType}:${p.periodKey}`}>{p.periodType === 'week' ? 'Неделя' : 'Месяц'} · {p.periodKey}</option>)}
        </select>
      </label>
      <button type="button" disabled={!period || busy} onClick={() => void preview()}>{busy ? 'Проверяем…' : 'Предпросмотр расчёта'}</button>
      {data.preview && <>
        <p>Полнота: {data.preview.complete ? 'полная' : 'неполная'}. Предпросмотр не изменяет архив и награды.</p>
        <ol>{data.preview.entries.map(row => <li key={row.place}>{row.username} · {Math.floor(row.active_ms / 60000)} мин</li>)}</ol>
      </>}
    </>}
  </section>;
}
