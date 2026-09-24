'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import styles from './CopyrightAdminClient.module.css';

type CopyrightCase = {
  id: string;
  case_number: string;
  claimant_name: string;
  claimant_company: string | null;
  claimant_email: string;
  claimant_role: string;
  work_title: string;
  rights_description: string;
  authority_statement: string;
  signature: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  urls: string[];
};

type Restriction = {
  id: string;
  case_id: string;
  scope: string;
  anime_id: number;
  season: number | null;
  episode: number | null;
  provider: string | null;
  reason: string | null;
  active: boolean;
  created_at: string;
  lifted_at: string | null;
};

type Dashboard = {
  metrics: {
    openCases: number;
    received: number;
    actionTaken: number;
    activeRestrictions: number;
  };
  cases: CopyrightCase[];
  restrictions: Restriction[];
};

const STATUS_LABELS: Record<string, string> = {
  received: 'Получено',
  needs_information: 'Нужна информация',
  under_review: 'На проверке',
  action_taken: 'Меры приняты',
  rejected: 'Отклонено',
  closed: 'Закрыто',
};

export default function CopyrightAdminClient() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [scope, setScope] = useState('title');
  const [animeId, setAnimeId] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [provider, setProvider] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/copyright', {
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as Dashboard & {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || 'Не удалось загрузить обращения.');
    }

    setError('');
    setDashboard(payload);
    setSelectedCaseId((current) => current || payload.cases?.[0]?.id || '');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((loadError) => {
        setError(
          loadError instanceof Error ? loadError.message : 'Ошибка загрузки.',
        );
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(
    () =>
      dashboard?.cases.find((item) => item.id === selectedCaseId) ?? null,
    [dashboard, selectedCaseId],
  );

  const caseRestrictions = useMemo(
    () =>
      (dashboard?.restrictions ?? []).filter(
        (item) => item.case_id === selectedCaseId,
      ),
    [dashboard, selectedCaseId],
  );

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/admin/copyright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Действие не выполнено.');
      }

      await load();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Ошибка действия.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function addRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    await mutate({
      action: 'add_restriction',
      caseId: selected.id,
      scope,
      animeId: Number(animeId),
      season: season ? Number(season) : null,
      episode: episode ? Number(episode) : null,
      provider: provider.trim() || null,
      reason: reason.trim() || null,
    });

    setReason('');
  }

  if (!dashboard) {
    return (
      <div className="admin-v1-page">
        <header className="admin-v1-header">
          <div>
            <span>RIGHTS HOLDER CENTER</span>
            <h1>Правообладатели</h1>
            <p>Обращения, ограничения источников и история решений.</p>
          </div>
        </header>

        {error ? (
          <div className="admin-v1-error">{error}</div>
        ) : (
          <div className="admin-v1-loading">Загружаем дела…</div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-v1-page">
      <header className="admin-v1-header">
        <div>
          <span>RIGHTS HOLDER CENTER</span>
          <h1>Правообладатели</h1>
          <p>Обращения, ограничения источников и история решений.</p>
        </div>

        <button type="button" onClick={() => void load()} disabled={busy}>
          Обновить
        </button>
      </header>

      {error && <div className="admin-v1-error">{error}</div>}

      <section className="admin-v1-metrics">
        <article>
          <span>Открытые дела</span>
          <strong>{dashboard.metrics.openCases}</strong>
          <small>received / review / info</small>
        </article>
        <article>
          <span>Новые</span>
          <strong>{dashboard.metrics.received}</strong>
          <small>ещё не разобраны</small>
        </article>
        <article>
          <span>Меры приняты</span>
          <strong>{dashboard.metrics.actionTaken}</strong>
          <small>action_taken</small>
        </article>
        <article>
          <span>Ограничения</span>
          <strong>{dashboard.metrics.activeRestrictions}</strong>
          <small>активны сейчас</small>
        </article>
      </section>

      <div className={styles.layout}>
        <section className={styles.caseList}>
          {dashboard.cases.length === 0 ? (
            <div className="admin-v1-empty">Обращений пока нет.</div>
          ) : (
            dashboard.cases.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  item.id === selectedCaseId
                    ? styles.caseActive
                    : styles.caseButton
                }
                onClick={() => setSelectedCaseId(item.id)}
              >
                <span className={styles.caseTop}>
                  <strong>{item.case_number}</strong>
                  <em data-status={item.status}>
                    {STATUS_LABELS[item.status] || item.status}
                  </em>
                </span>
                <b>{item.work_title}</b>
                <small>
                  {item.claimant_company || item.claimant_name}
                  {' · '}
                  {new Date(item.created_at).toLocaleDateString('ru-RU')}
                </small>
              </button>
            ))
          )}
        </section>

        <section className={styles.detail}>
          {selected ? (
            <>
              <div className={styles.detailHead}>
                <div>
                  <span>{selected.case_number}</span>
                  <h2>{selected.work_title}</h2>
                  <p>
                    {selected.claimant_name}
                    {selected.claimant_company
                      ? ' · ' + selected.claimant_company
                      : ''}
                  </p>
                </div>
                <a href={'mailto:' + selected.claimant_email}>
                  {selected.claimant_email}
                </a>
              </div>

              <div className={styles.copyBlock}>
                <strong>Спорный материал</strong>
                <p>{selected.rights_description}</p>
              </div>

              <div className={styles.copyBlock}>
                <strong>Основание полномочий</strong>
                <p>{selected.authority_statement}</p>
              </div>

              <div className={styles.urls}>
                <strong>URL</strong>
                {selected.urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                ))}
              </div>

              <div className={styles.statusActions}>
                {[
                  ['under_review', 'В проверку'],
                  ['needs_information', 'Запросить данные'],
                  ['rejected', 'Отклонить'],
                  ['closed', 'Закрыть'],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        action: 'set_status',
                        caseId: selected.id,
                        status,
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                className={styles.restrictionForm}
                onSubmit={addRestriction}
              >
                <div>
                  <span>TAKEDOWN CONTROL</span>
                  <h3>Добавить ограничение</h3>
                </div>

                <div className={styles.restrictionGrid}>
                  <label>
                    <span>Scope</span>
                    <select
                      value={scope}
                      onChange={(event) => setScope(event.target.value)}
                    >
                      <option value="title">Весь тайтл</option>
                      <option value="season">Сезон</option>
                      <option value="episode">Эпизод</option>
                      <option value="provider">Источник</option>
                    </select>
                  </label>

                  <label>
                    <span>AniList animeId</span>
                    <input
                      required
                      inputMode="numeric"
                      value={animeId}
                      onChange={(event) => setAnimeId(event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Сезон</span>
                    <input
                      inputMode="numeric"
                      value={season}
                      onChange={(event) => setSeason(event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Эпизод</span>
                    <input
                      inputMode="numeric"
                      value={episode}
                      onChange={(event) => setEpisode(event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Provider</span>
                    <input
                      placeholder="Kodik / AniLiberty / AnimeBox Direct"
                      value={provider}
                      onChange={(event) => setProvider(event.target.value)}
                    />
                  </label>
                </div>

                <label>
                  <span>Причина / внутренняя заметка</span>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>

                <button type="submit" disabled={busy}>
                  Применить ограничение
                </button>
              </form>

              <div className={styles.restrictions}>
                <h3>Ограничения по делу</h3>

                {caseRestrictions.length === 0 ? (
                  <p>Пока нет.</p>
                ) : (
                  caseRestrictions.map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>
                          {item.scope} · anime #{item.anime_id}
                        </strong>
                        <span>
                          {item.season ? 'season ' + item.season + ' · ' : ''}
                          {item.episode
                            ? 'episode ' + item.episode + ' · '
                            : ''}
                          {item.provider || 'all providers'}
                        </span>
                      </div>

                      <em data-active={item.active}>
                        {item.active ? 'ACTIVE' : 'LIFTED'}
                      </em>

                      {item.active && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void mutate({
                              action: 'lift_restriction',
                              restrictionId: item.id,
                            })
                          }
                        >
                          Снять
                        </button>
                      )}
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="admin-v1-empty">Выбери дело слева.</div>
          )}
        </section>
      </div>
    </div>
  );
}
