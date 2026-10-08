import 'server-only';
import { configurationIssues, deploymentRelease, type DeploymentEnv } from '@/lib/deployment-readiness';
import { boundedJson } from '@/lib/reliability-network';
import { getTelegramWebhookStatus } from '@/lib/telegram-webhook-server';
import type { ReliabilityProbe, ReliabilitySnapshot } from '@/types/reliability';

type ProbeResult = Pick<ReliabilityProbe, 'code' | 'state' | 'action'>;

async function probe(service: string, run: () => Promise<ProbeResult>): Promise<ReliabilityProbe> {
  const start = Date.now();
  try { return { service, ...await run(), elapsedMs: Date.now() - start }; }
  catch (error) {
    // URLs and upstream exception strings can contain credentials. Fixed codes only.
    const message = error instanceof Error ? error.message : '';
    const knownCodes = new Set(['http_401', 'http_403', 'http_429', 'http_500', 'http_502', 'http_503', 'http_504', 'invalid_schema', 'source_missing', 'response_too_large', 'empty_body']);
    const code = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
      ? 'dependency_timeout' : knownCodes.has(message) ? message : 'dependency_probe_failed';
    return { service, state: 'unavailable', code, elapsedMs: Date.now() - start,
      action: 'Проверьте доступность сервиса, ключи и миграции. Таймаут/HTTP/schema ошибка; подробности секретных ответов скрыты.' };
  }
}

const skipped: ProbeResult = { state: 'not_configured', code: 'configuration_required', action: 'Сначала устраните проблемы конфигурации этого сервиса.' };

export async function collectReliabilitySnapshot(env: DeploymentEnv = process.env): Promise<ReliabilitySnapshot> {
  const configuration = configurationIssues(env);
  const supabaseInvalid = configuration.some(issue => issue.service === 'Supabase' && issue.severity === 'error');
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '') || '';
  const publicKey = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim() || '';
  const serverKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const probes = await Promise.all([
    probe('Supabase Auth', async () => {
      if (supabaseInvalid) return skipped;
      const data = await boundedJson(`${url}/auth/v1/settings`, { headers: { apikey: publicKey } });
      if (!data || typeof data !== 'object' || !('external' in data) || !data.external || typeof data.external !== 'object' || Array.isArray(data.external)) throw new Error('invalid_schema');
      return { state: 'healthy', code: 'auth_api_ready', action: 'Auth API доступен. Вход пользователя необходимо проверить отдельно.' };
    }),
    probe('Supabase Database', async () => {
      if (supabaseInvalid) return skipped;
      const headers: Record<string, string> = { apikey: serverKey };
      if (!serverKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${serverKey}`;
      const data = await boundedJson(`${url}/rest/v1/system_incidents?select=id&limit=1`, { headers });
      if (!Array.isArray(data)) throw new Error('invalid_schema');
      return { state: 'healthy', code: 'monitoring_table_ready', action: 'Серверный ключ и таблица мониторинга доступны. Остальные таблицы проверяет существующая панель.' };
    }),
    probe('Kodik', async () => {
      const token = env.KODIK_TOKEN?.trim();
      if (!token) return skipped;
      const search = new URL('https://kodik-api.com/search');
      search.searchParams.set('token', token);
      search.searchParams.set('shikimori_id', '21');
      search.searchParams.set('limit', '1');
      const data = await boundedJson(search.toString()) as { results?: { link?: unknown }[] };
      if (!Array.isArray(data?.results) || !data.results.some(item => typeof item?.link === 'string' && item.link.length > 0)) throw new Error('source_missing');
      return { state: 'healthy', code: 'provider_api_ready', action: 'API вернул источник. Воспроизведение видео этим запросом не проверено.' };
    }),
    probe('Telegram', async () => {
      const status = await getTelegramWebhookStatus();
      if (!status.tokenConfigured) return skipped;
      if (!status.secretValid || !status.urlMatches || !status.requiredUpdatesEnabled) return {
        state: 'attention', code: 'webhook_configuration_invalid', action: 'Откройте Telegram в админ-панели: проверьте настройки и восстановите webhook владельцем.',
      };
      const recentError = status.lastErrorAt && Date.now() - Date.parse(status.lastErrorAt) < 15 * 60_000;
      if (status.pendingUpdates > 0 || recentError) return {
        state: 'attention', code: 'webhook_delivery_attention', action: 'Есть очередь или недавняя ошибка доставки. Проверьте /start и повторно посмотрите очередь.',
      };
      return { state: 'healthy', code: 'webhook_settings_ready', action: 'Известные настройки корректны. Реальный ответ на /start необходимо проверить в Telegram.' };
    }),
  ]);
  return { checkedAt: new Date().toISOString(), release: deploymentRelease(env), configuration, probes };
}
