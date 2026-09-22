'use client';

import { useEffect, useState } from 'react';
import type { ActivationDashboard as Dashboard, ActivationRange } from '@/lib/activation-analytics';
import styles from './ActivationDashboard.module.css';

type ApiResponse = { ok?: boolean; dashboard?: Dashboard; error?: string };

function pct(value: number) { return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`; }
function num(value: number) { return value.toLocaleString('ru-RU'); }

export default function ActivationDashboard() {
  const [range, setRange] = useState<ActivationRange>(7);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/activation?days=${range}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok || !payload.dashboard) throw new Error('Не удалось загрузить Activation Analytics.');
        setDashboard(payload.dashboard);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Activation Analytics unavailable');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range]);

  const k = dashboard?.kpis;
  return (
    <section className={styles.dashboard} aria-label="AnimeBox Activation Analytics">
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>ACTIVATION · V2</span><h1>Auth & Personal Home</h1><p>Где пользователь входит, активируется и доходит до реального просмотра.</p></div>
        <div className={styles.range}>{([7,30] as const).map((days) => <button key={days} type="button" className={days === range ? styles.active : ''} onClick={() => { if (days === range) return; setLoading(true); setError(''); setRange(days); }}>{days}d</button>)}</div>
      </header>
      {error && <div className={styles.error}>{error}</div>}
      {loading && !dashboard && <div className={styles.loading}>Собираем Activation funnel…</div>}
      {dashboard && k && <>
        {dashboard.truncated && <p role="status">Выборка ограничена первыми 20 000 событиями периода. Показатели неполные; выбери меньший период.</p>}
        <div className={styles.kpis}>
          <article><span>Visit sessions</span><strong>{num(k.visitSessions)}</strong><small>{dashboard.rangeDays} дней</small></article>
          <article><span>Auth completion</span><strong>{pct(k.authCompletionRate)}</strong><small>{num(dashboard.authFunnel[1].sessions)} завершили после открытия входа</small></article>
          <article><span>Registrations</span><strong>{num(k.registrationSessions)}</strong><small>{num(k.onboardingCompletedSessions)} onboarding completed</small></article>
          <article><span>Visit → play</span><strong>{pct(k.visitToPlayRate)}</strong><small>{num(dashboard.funnel[2].sessions)} прошли путь от визита до просмотра</small></article>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>FUNNEL</span><h2>От визита до просмотра</h2></div><small>{num(dashboard.sampledEvents)} событий</small></div>
          <div className={styles.funnel}>{dashboard.funnel.map((stage) => <div className={styles.stage} key={stage.key}><strong>{stage.label}</strong><div className={styles.bar}><i style={{ width: `${Math.max(2, Math.min(100, stage.rateFromVisits))}%` }} /></div><small>{num(stage.sessions)} · {pct(stage.rateFromVisits)}</small></div>)}</div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>AUTH</span><h2>От открытия входа до авторизации</h2></div></div>
          <p>Шаги считаются последовательно в одной сессии. Вход не обязателен для воронки просмотра; автоматический вход учитывается в общих событиях.</p>
          <div className={styles.funnel}>{dashboard.authFunnel.map((stage) => <div className={styles.stage} key={stage.key}><strong>{stage.label}</strong><div className={styles.bar}><i style={{ width: `${stage.rateFromVisits}%` }} /></div><small>{num(stage.sessions)} · {pct(stage.rateFromVisits)}</small></div>)}</div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>SOURCES</span><h2>Где проходит авторизация</h2></div></div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Surface</th><th>Auth opened</th><th>Auth completed</th><th>Registrations</th><th>Player starts</th></tr></thead><tbody>{dashboard.surfaces.map((surface) => <tr key={surface.source}><td>{surface.source}</td><td>{num(surface.authOpened)}</td><td>{num(surface.authCompleted)}</td><td>{num(surface.registrations)}</td><td>{num(surface.playerStarts)}</td></tr>)}</tbody></table></div>
        </section>
      </>}
    </section>
  );
}
