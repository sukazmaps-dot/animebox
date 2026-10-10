const EXPECTED_WEBHOOK = 'https://youranimebox.com/api/telegram/webhook';
const RECENT_ERROR_SECONDS = 15 * 60;

function deliveryErrorCategory(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (/\b(?:401|403)\b|unauthorized|forbidden/i.test(value)) return 'access_denied';
  if (/\b(?:500|502|503|504)\b/i.test(value)) return 'server_error';
  if (/certificate|ssl|tls/i.test(value)) return 'tls_error';
  if (/timed? out|timeout/i.test(value)) return 'timeout';
  if (/resolve|connect|dns/i.test(value)) return 'network_error';
  return 'delivery_error';
}

/** Owner diagnostics: no raw Telegram errors, tokens, URLs or user data. */
export async function diagnoseTelegramWebhook({
  token, secret, fetchImpl = fetch, now = Date.now(),
}: { token: string | null; secret: string | null; fetchImpl?: typeof fetch; now?: number }) {
  const configuration = {
    botTokenConfigured: Boolean(token), webhookSecretConfigured: Boolean(secret),
    checkedAt: new Date(now).toISOString(), secretRegistrationVerified: false,
  };
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token) || !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return { ...configuration, state: 'misconfigured', reason: 'missing_or_invalid_server_credentials' };
  }
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true || !data.result || typeof data.result.url !== 'string') {
      return { ...configuration, state: 'unavailable', reason: response.status === 401 ? 'telegram_credentials_rejected' : 'telegram_api_rejected' };
    }
    const info = data.result;
    const canonicalUrlMatches = info.url === EXPECTED_WEBHOOK;
    const pendingUpdates = Number.isSafeInteger(info.pending_update_count) && info.pending_update_count >= 0 ? info.pending_update_count : null;
    const lastErrorAt = Number.isSafeInteger(info.last_error_date) && info.last_error_date > 0 ? info.last_error_date : null;
    const recentError = lastErrorAt !== null && lastErrorAt >= Math.floor(now / 1000) - RECENT_ERROR_SECONDS;
    return {
      ...configuration,
      state: canonicalUrlMatches && !recentError && pendingUpdates !== null && pendingUpdates < 100 ? 'ready' : 'degraded',
      webhookConfigured: Boolean(info.url), canonicalUrlMatches, pendingUpdates,
      lastErrorAt, recentError, lastErrorCategory: deliveryErrorCategory(info.last_error_message),
      // Telegram does not expose the registered secret_token in getWebhookInfo.
      reason: !canonicalUrlMatches ? 'webhook_url_mismatch' : recentError ? 'recent_delivery_error' :
        pendingUpdates === null ? 'invalid_webhook_metadata' : pendingUpdates >= 100 ? 'update_backlog' : null,
    };
  } catch {
    // Native fetch errors can embed the token in their URL; never serialize them.
    return { ...configuration, state: 'unavailable', reason: 'telegram_network_unavailable' };
  }
}
