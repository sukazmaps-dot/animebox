'use client';

import { useState } from 'react';
import type { TelegramWebhookStatus } from '@/types/telegram-webhook';

export default function TelegramAdminPage() {
  const [status, setStatus] = useState<TelegramWebhookStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [repaired, setRepaired] = useState(false);

  async function execute(repair: boolean) {
    setBusy(true);
    setError('');
    setRepaired(false);
    try {
      const result = await fetch('/api/admin/telegram-webhook', repair ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair' }), cache: 'no-store',
      } : { cache: 'no-store' });
      const payload = await result.json();
      if (!result.ok || !payload.ok) throw new Error(payload.error || 'Не удалось проверить webhook.');
      setStatus(payload.status);
      setRepaired(repair);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проверить webhook.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Telegram-бот</h1>
      <p>Проверь доставку команд после переноса сайта. Восстановление доступно владельцу и сохраняет ожидающие обновления.</p>
      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg border px-4 py-3 disabled:opacity-50" disabled={busy} onClick={() => void execute(false)}>Проверить webhook</button>
        <button className="rounded-lg border px-4 py-3 disabled:opacity-50" disabled={busy} onClick={() => void execute(true)}>Восстановить webhook</button>
      </div>
      <div aria-live="polite">
        {busy && <p>Проверяем соединение с Telegram…</p>}
        {error && <p role="alert">{error}</p>}
        {repaired && <p>Webhook установлен и проверен. Отправь боту /start, чтобы проверить реальный ответ.</p>}
      </div>
      {status && (
        <dl className="space-y-4 break-words">
          <div><dt className="font-semibold">Токен на сервере</dt><dd>{status.tokenConfigured ? 'Задан' : 'Отсутствует'}</dd></div>
          <div><dt className="font-semibold">Секрет webhook</dt><dd>{status.secretValid ? 'Задан, формат корректен' : status.secretConfigured ? 'Неверный формат' : 'Отсутствует'}</dd></div>
          <div><dt className="font-semibold">Адрес у Telegram</dt><dd>{status.currentUrl || 'Webhook не установлен'}</dd></div>
          <div><dt className="font-semibold">Канонический адрес</dt><dd>{status.expectedUrl}</dd></div>
          <div><dt className="font-semibold">Совпадение адресов</dt><dd>{status.urlMatches ? 'Да' : 'Нет'}</dd></div>
          <div><dt className="font-semibold">Ожидающие обновления</dt><dd>{status.pendingUpdates}</dd></div>
          <div><dt className="font-semibold">Доставка команд и Stars</dt><dd>{status.requiredUpdatesEnabled ? 'Типы обновлений включены' : 'Нужные типы обновлений исключены'}</dd></div>
          <div><dt className="font-semibold">Последняя ошибка доставки</dt><dd>{status.lastError || 'Не зарегистрирована'}{status.lastErrorAt && ` (${status.lastErrorAt})`}</dd></div>
        </dl>
      )}
    </main>
  );
}
