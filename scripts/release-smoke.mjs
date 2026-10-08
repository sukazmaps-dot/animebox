import { pathToFileURL } from 'node:url';

async function requestJson(fetchImpl, url) {
  const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('http_failure');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty_body');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128 * 1024) throw new Error('body_limit');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function runSmoke({ base = 'https://youranimebox.com', expectedSha = '', waitMs = 0, fetchImpl = fetch } = {}) {
  const origin = new URL(base);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('invalid_base');
  if (expectedSha && !/^[a-f0-9]{40}$/i.test(expectedSha)) throw new Error('invalid_expected_sha');
  const endpoint = path => new URL(path, origin).toString();
  const results = [];
  const deadline = Date.now() + waitMs;
  let readiness;
  do {
    try { readiness = await requestJson(fetchImpl, endpoint('/api/health/ready')); } catch { readiness = null; }
    if (readiness?.ok === true && readiness.status === 'ready' && readiness.release?.version === 'reliability-foundation-v1' &&
        (!expectedSha || readiness.release.sha === expectedSha.toLowerCase())) break;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(10_000, Math.max(0, deadline - Date.now()))));
  } while (Date.now() <= deadline);
  results.push({ check: 'release_readiness', ok: Boolean(readiness?.ok === true && readiness.status === 'ready' &&
    readiness.release?.version === 'reliability-foundation-v1' && (!expectedSha || readiness.release.sha === expectedSha.toLowerCase())) });
  const checks = [
    ['home', async () => {
      const response = await fetchImpl(endpoint('/'), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
      const valid = response.status === 200 && (response.headers.get('content-type') || '').includes('text/html');
      const reader = response.body?.getReader();
      if (!reader) return false;
      try {
        const chunk = await reader.read();
        return valid && Boolean(chunk.value?.byteLength);
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }],
    ['public_auth_configuration', async () => {
      const data = await requestJson(fetchImpl, endpoint('/api/auth/config'));
      return typeof data?.googleClientId === 'string' && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(data.googleClientId) &&
        typeof data?.telegramClientId === 'string' && /^\d+$/.test(data.telegramClientId) && Number.isSafeInteger(Number(data.telegramClientId)) && Number(data.telegramClientId) > 0;
    }],
    ['search', async () => {
      const data = await requestJson(fetchImpl, endpoint('/api/search/instant?q=Naruto&limit=4'));
      return Array.isArray(data?.items) && data.items.length > 0;
    }],
  ];
  const rest = await Promise.all(checks.map(async ([check, run]) => {
    try { return { check, ok: Boolean(await run()) }; } catch { return { check, ok: false }; }
  }));
  return { ok: results.concat(rest).every(item => item.ok), checks: results.concat(rest),
    limits: ['Real account login, Telegram command delivery and video playback require separate verification.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  try {
    const waitMs = Number(option('--wait-seconds') || '0') * 1000;
    if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 15 * 60_000) throw new Error('invalid_wait');
    const result = await runSmoke({ base: option('--base'), expectedSha: option('--expected-sha'), waitMs });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch { console.error('Smoke configuration or execution failed.'); process.exitCode = 1; }
}
