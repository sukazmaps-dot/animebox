import { pathToFileURL } from 'node:url';

const WEBHOOK_URL = 'https://youranimebox.com/api/telegram/webhook';

export async function checkTelegramWebhook({ env = process.env, apply = false, fetchImpl = fetch } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('TELEGRAM_BOT_TOKEN is missing or invalid.');
  if (apply && (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret))) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 1–256 Telegram-compatible characters.');
  }

  async function call(method, body = {}) {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error('rejected');
      return data.result;
    } catch {
      // Fetch errors can include the request URL, which contains the bot token.
      throw new Error(`Telegram ${method} failed. Check credentials/network; secrets were omitted.`);
    }
  }

  const before = await call('getWebhookInfo');
  if (apply) {
    // Empty update cannot send a message or change payment/account state.
    let probe;
    try {
      probe = await fetchImpl(WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
        body: '{}', signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      const data = await probe.json();
      if (!probe.ok || data.ok !== true) throw new Error('rejected');
    } catch {
      throw new Error('AnimeBox webhook probe failed. Check Railway secrets and gateway routing before changing Telegram.');
    }
    await call('setWebhook', {
      url: WEBHOOK_URL, secret_token: secret, drop_pending_updates: false,
      // Preserve subscribed update types, including Stars subscription events.
      ...(Array.isArray(before.allowed_updates) ? { allowed_updates: before.allowed_updates } : {}),
    });
  }
  const info = apply ? await call('getWebhookInfo') : before;
  const matches = info.url === WEBHOOK_URL;
  return {
    configured: Boolean(info.url), canonicalUrlMatches: matches,
    pendingUpdates: info.pending_update_count ?? 0,
    lastErrorAt: info.last_error_date ?? null,
    hasRecordedError: Boolean(info.last_error_message),
    allowedUpdates: info.allowed_updates ?? null,
    applied: apply, healthyConfiguration: matches,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) {
    console.error('Usage: node scripts/telegram-webhook-ops.mjs [--apply]');
    process.exitCode = 1;
  } else {
    try {
      const result = await checkTelegramWebhook({ apply: args.includes('--apply') });
      console.log(JSON.stringify(result, null, 2));
      if (!result.healthyConfiguration) process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
