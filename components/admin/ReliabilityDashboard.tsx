'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReliabilitySnapshot } from '@/types/reliability';

const labels = { healthy: 'Проверка пройдена', attention: 'Требует внимания', unavailable: 'Проверка не пройдена', not_configured: 'Не настроено' };

export default function ReliabilityDashboard() {
  const [snapshot, setSnapshot] = useState<ReliabilitySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setBusy(true);
    setError('');
    setSnapshot(null);
    try {
      const result = await fetch('/api/admin/reliability', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const payload = await result.json();
      if (!result.ok || payload.ok !== true) throw new Error(payload.error || 'Диагностика недоступна.');
      setSnapshot(payload.snapshot);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Диагностика недоступна.'); }
    finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="reliability-heading" className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <h2 id="reliability-heading" className="text-xl font-semibold">Готовность после выпуска</h2>
      <p>Проверка окружения и основных зависимостей. Успешный запрос к API не подтверждает вход пользователя, воспроизведение или ответ бота.</p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" disabled={busy} onClick={() => void check()} className="rounded-lg border px-4 py-3 disabled:opacity-50">{busy ? 'Проверяем…' : 'Проверить готовность'}</button>
        <Link href="/admin/telegram" className="underline">Диагностика и восстановление Telegram</Link>
      </div>
      <div aria-live="polite">{error && <p role="alert">{error}</p>}</div>
      {snapshot && <>
        <p className="break-all">Версия: {snapshot.release.version}; commit: {snapshot.release.sha || 'платформа не передала SHA'}. Проверено: {new Date(snapshot.checkedAt).toLocaleString('ru-RU')}.</p>
        <h3 className="font-semibold">Конфигурация</h3>
        {snapshot.configuration.length ? <ul className="space-y-2">
          {snapshot.configuration.map(issue => <li key={issue.code} className="rounded-lg border p-3">
            <strong>{issue.service}: {issue.severity === 'error' ? 'блокирующая ошибка' : 'предупреждение'}</strong>
            <p>{issue.action}</p><code className="text-sm">{issue.code}</code>
          </li>)}
        </ul> : <p>Проверки конфигурации пройдены. Ключи проверяются запросами ниже.</p>}
        <h3 className="font-semibold">Запросы к сервисам</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {snapshot.probes.map(probe => <li key={probe.service} className="rounded-lg border p-3">
            <strong>{probe.service}: {labels[probe.state]}</strong>
            <p>{probe.action}</p><p className="text-sm">{probe.code} · {probe.elapsedMs} мс</p>
          </li>)}
        </ul>
      </>}
    </section>
  );
}
