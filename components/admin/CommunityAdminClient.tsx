'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './CommunityAdminClient.module.css';

type Dashboard = {
  role: 'owner' | 'admin' | 'moderator';
  metrics: { messages24h: number; activeChatters24h: number; openReports: number; restrictedUsers: number };
  settings: { slowModeSeconds: number; pinnedMessageId: string | null; updatedAt: string | null };
  reports: Array<{
    id: string; message_id: string; reporter_id: string; reason: string; details: string | null; created_at: string;
    messageBody: string; authorId: string | null; authorUsername: string; reporterUsername: string;
  }>;
  commentReports: Array<{
    id: string; comment_id: string; reporter_id: string; reason: string; details: string | null; created_at: string;
    commentBody: string; authorId: string | null; authorUsername: string; reporterUsername: string;
    animeId: number | null; episode: number | null;
  }>;
  controls: Array<{ user_id: string; username: string; status: string; note: string | null; expires_at: string | null; updated_at: string }>;
};

async function json<T>(response: Response) {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Ошибка Community Admin.');
  return payload;
}

export default function CommunityAdminClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [systemMessage, setSystemMessage] = useState('');
  const [pinSystem, setPinSystem] = useState(false);
  const [pinId, setPinId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const value = await json<Dashboard>(await fetch('/api/admin/community', { cache: 'no-store' }));
      setData(value); setPinId(value.settings.pinnedMessageId ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить панель.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function action(key: string, payload: Record<string, unknown>) {
    setBusy(key); setError('');
    try {
      await json<{ ok: boolean }>(await fetch('/api/admin/community', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store',
      }));
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Не удалось выполнить действие.');
    } finally { setBusy(''); }
  }

  if (loading && !data) return <main className={styles.page}><p>Загрузка Community Admin…</p></main>;
  if (!data) return <main className={styles.page}><p className={styles.error}>{error || 'Нет доступа.'}</p></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span>ANIMEBOX COMMUNITY · PRODUCTION</span><h1>Community Admin</h1><p>Жалобы, ограничения, slow mode, системные и закреплённые сообщения.</p></div>
        <div><Link href="/chat">← В чат</Link><button type="button" onClick={() => void load()} disabled={loading}>Обновить</button></div>
      </header>

      {error && <button className={styles.error} type="button" onClick={() => setError('')}>{error}</button>}

      <section className={styles.metrics}>
        <article><span>Сообщений · 24ч</span><strong>{data.metrics.messages24h}</strong></article>
        <article><span>Писали · 24ч</span><strong>{data.metrics.activeChatters24h}</strong></article>
        <article><span>Открытых жалоб</span><strong>{data.metrics.openReports}</strong></article>
        <article><span>Ограничено</span><strong>{data.metrics.restrictedUsers}</strong></article>
      </section>

      <section className={styles.grid2}>
        <article className={styles.card}>
          <span className={styles.eyebrow}>CHAT CONTROL</span><h2>Slow mode</h2>
          <div className={styles.row}>
            <select value={data.settings.slowModeSeconds} disabled={data.role === 'moderator' || Boolean(busy)} onChange={(event) => void action('slow', { action: 'set_slow_mode', seconds: Number(event.target.value) })}>
              <option value={0}>OFF · базовые 2 сек.</option><option value={5}>5 секунд</option><option value={10}>10 секунд</option><option value={30}>30 секунд</option><option value={60}>60 секунд</option>
            </select>
          </div>
          <small>База всегда ограничивает флуд: 2 сек. между сообщениями и 6 сообщений / 20 сек.</small>
        </article>

        <article className={styles.card}>
          <span className={styles.eyebrow}>PINNED MESSAGE</span><h2>Закрепление</h2>
          <div className={styles.row}><input value={pinId} onChange={(event) => setPinId(event.target.value)} placeholder="UUID сообщения или пусто" /><button type="button" disabled={data.role === 'moderator' || Boolean(busy)} onClick={() => void action('pin', { action: 'pin_message', messageId: pinId.trim() || null })}>Сохранить</button></div>
          <small>UUID можно взять из адреса/инспектора или закрепить новое системное сообщение ниже.</small>
        </article>
      </section>

      <section className={styles.card}>
        <span className={styles.eyebrow}>SYSTEM MESSAGE</span><h2>Сообщение AnimeBox</h2>
        <textarea value={systemMessage} onChange={(event) => setSystemMessage(event.target.value.slice(0, 500))} maxLength={500} placeholder="Например: сегодня обновили Profile Studio…" />
        <div className={styles.systemActions}><label><input type="checkbox" checked={pinSystem} onChange={(event) => setPinSystem(event.target.checked)} /> Сразу закрепить</label><button type="button" disabled={data.role === 'moderator' || !systemMessage.trim() || Boolean(busy)} onClick={() => void action('system', { action: 'system_message', body: systemMessage, pin: pinSystem }).then(() => setSystemMessage(''))}>Опубликовать</button></div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>REPORT QUEUE</span><h2>Жалобы</h2></div><strong>{data.reports.length}</strong></div>
        <div className={styles.reports}>
          {data.reports.map((report) => (
            <article key={report.id} className={styles.report}>
              <div className={styles.reportTop}><span>{report.reason}</span><time>{new Date(report.created_at).toLocaleString('ru-RU')}</time></div>
              <p>{report.messageBody}</p>
              <small>Автор: <Link href={report.authorId ? `/profile/${report.authorId}` : '#'}>{report.authorUsername}</Link> · пожаловался: {report.reporterUsername}{report.details ? ` · ${report.details}` : ''}</small>
              <div className={styles.actions}>
                <button type="button" disabled={Boolean(busy)} onClick={() => void action(`dismiss:${report.id}`, { action: 'resolve_report', reportId: report.id, status: 'dismissed' })}>Отклонить</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void action(`delete:${report.id}`, { action: 'delete_message', messageId: report.message_id })}>Удалить сообщение</button>
                {report.authorId && <button type="button" disabled={Boolean(busy)} onClick={() => void action(`mute:${report.id}`, { action: 'mute_user', userId: report.authorId, minutes: 60, reason: `Жалоба ${report.reason}` })}>Mute 1ч</button>}
                {report.authorId && data.role !== 'moderator' && <button type="button" className={styles.danger} disabled={Boolean(busy)} onClick={() => void action(`ban:${report.id}`, { action: 'ban_user', userId: report.authorId, reason: `Жалоба ${report.reason}` })}>Ban</button>}
                <button type="button" disabled={Boolean(busy)} onClick={() => void action(`done:${report.id}`, { action: 'resolve_report', reportId: report.id, status: 'actioned' })}>Закрыть как обработанную</button>
              </div>
            </article>
          ))}
          {!data.reports.length && <p className={styles.empty}>Открытых жалоб нет.</p>}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>EPISODE COMMENT REPORTS</span>
            <h2>Жалобы на обсуждения</h2>
          </div>
          <strong>{data.commentReports.length}</strong>
        </div>

        <div className={styles.reports}>
          {data.commentReports.map((report) => (
            <article key={report.id} className={styles.report}>
              <div className={styles.reportTop}>
                <span>{report.reason}</span>
                <time>{new Date(report.created_at).toLocaleString('ru-RU')}</time>
              </div>

              <p>{report.commentBody}</p>

              <small>
                Автор:{' '}
                <Link href={report.authorId ? `/profile/${report.authorId}` : '#'}>
                  {report.authorUsername}
                </Link>
                {' · '}пожаловался: {report.reporterUsername}
                {report.episode ? ` · серия ${report.episode}` : ''}
                {report.details ? ` · ${report.details}` : ''}
              </small>

              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void action(`comment-dismiss:${report.id}`, {
                      action: 'resolve_comment_report',
                      reportId: report.id,
                      status: 'dismissed',
                    })
                  }
                >
                  Отклонить
                </button>

                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void action(`comment-delete:${report.id}`, {
                      action: 'delete_comment',
                      commentId: report.comment_id,
                    })
                  }
                >
                  Удалить комментарий
                </button>

                {report.authorId && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void action(`comment-mute:${report.id}`, {
                        action: 'mute_user',
                        userId: report.authorId,
                        minutes: 60,
                        reason: `Жалоба на комментарий: ${report.reason}`,
                      })
                    }
                  >
                    Mute 1ч
                  </button>
                )}

                {report.authorId && data.role !== 'moderator' && (
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void action(`comment-ban:${report.id}`, {
                        action: 'ban_user',
                        userId: report.authorId,
                        reason: `Жалоба на комментарий: ${report.reason}`,
                      })
                    }
                  >
                    Ban
                  </button>
                )}

                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void action(`comment-done:${report.id}`, {
                      action: 'resolve_comment_report',
                      reportId: report.id,
                      status: 'actioned',
                    })
                  }
                >
                  Закрыть как обработанную
                </button>
              </div>
            </article>
          ))}

          {!data.commentReports.length && (
            <p className={styles.empty}>Жалоб на комментарии нет.</p>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>RESTRICTIONS</span><h2>Mute / Ban</h2></div><strong>{data.controls.length}</strong></div>
        <div className={styles.controls}>{data.controls.map((control) => <article key={control.user_id}><div><Link href={`/profile/${control.user_id}`}>{control.username}</Link><span data-status={control.status}>{control.status}</span><small>{control.expires_at ? `до ${new Date(control.expires_at).toLocaleString('ru-RU')}` : 'без срока'}{control.note ? ` · ${control.note}` : ''}</small></div><button type="button" disabled={Boolean(busy)} onClick={() => void action(`unmute:${control.user_id}`, { action: 'unrestrict_user', userId: control.user_id, reason: 'Снято из Community Admin' })}>Снять</button></article>)}</div>
        {!data.controls.length && <p className={styles.empty}>Активных ограничений нет.</p>}
      </section>
    </main>
  );
}
