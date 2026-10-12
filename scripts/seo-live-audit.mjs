/** Read-only live SEO audit: node scripts/seo-live-audit.mjs */
const origin = 'https://youranimebox.com';
const paths = ['/robots.txt', '/sitemap-index.xml', '/sitemap.xml',
  '/sitemap-recent.xml', '/video-sitemap.xml', '/anime/sitemap/0.xml',
  '/episodes/sitemap/0.xml'];
const failures = [];
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
async function fetchChecked(path) {
  const response = await fetch(origin + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'AnimeBox-SEO-ReadOnly-Audit/1.0' },
  });
  if (response.status !== 200) throw new Error('HTTP ' + response.status);
  if (Number(response.headers.get('content-length') || 0) > 9_000_000)
    throw new Error('Response exceeds size budget');
  const body = await response.text();
  if (body.length > 9_000_000) throw new Error('Body exceeds size budget');
  return { response, body };
}
const xmlByPath = new Map();
for (const path of paths) {
  try {
    const { response, body } = await fetchChecked(path);
    if (path === '/robots.txt') {
      if (!body.includes('Sitemap: ' + origin + '/sitemap-index.xml'))
        throw new Error('No sitemap index in robots.txt');
      if (/Disallow:\s*\/anime\//i.test(body))
        throw new Error('/anime/ is blocked');
      console.log('[ok] robots.txt');
      continue;
    }
    if (!response.headers.get('content-type')?.includes('xml') ||
        !/<(?:urlset|sitemapindex)\b/.test(body))
      throw new Error('Invalid XML content type or root');
    const urls = locs(body);
    if (!urls.length && path !== '/sitemap-recent.xml' && path !== '/video-sitemap.xml')
      throw new Error('Unexpected empty sitemap');
    const seen = new Set();
    for (const url of urls) {
      const u = new URL(url);
      if (u.origin !== origin || u.search || u.hash || seen.has(url))
        throw new Error('Duplicate or invalid sitemap location');
      seen.add(url);
    }
    if (path === '/sitemap-index.xml') {
      for (const must of ['/sitemap.xml', '/sitemap-recent.xml', '/video-sitemap.xml',
        '/anime/sitemap/0.xml', '/episodes/sitemap/0.xml'])
        if (!seen.has(origin + must)) throw new Error('Index missing ' + must);
    }
    xmlByPath.set(path, urls);
    console.log('[ok] ' + path + ': ' + urls.length + ' locations');
  } catch (error) {
    failures.push(path + ': ' + String(error));
    console.error('[FAIL] ' + path);
  }
}
for (const sitemap of ['/anime/sitemap/0.xml', '/episodes/sitemap/0.xml']) {
  const samples = (xmlByPath.get(sitemap) || []).slice(0, 2);
  for (const url of samples) {
    try {
      const pathname = new URL(url).pathname;
      const { body, response } = await fetchChecked(pathname);
      if (!response.headers.get('content-type')?.includes('html'))
        throw new Error('Not HTML');
      if (/noindex/i.test(response.headers.get('x-robots-tag') || ''))
        throw new Error('X-Robots-Tag says noindex');
      const metas = [...body.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
      const robotMeta = metas.find((tag) => /\bname=["'](?:robots|googlebot)["']/i.test(tag));
      if (robotMeta && /noindex/i.test(robotMeta))
        throw new Error('HTML meta noindex');
      const canonicalTag = [...body.matchAll(/<link\b[^>]*>/gi)]
        .map((m) => m[0]).find((tag) => /\brel=["']canonical["']/i.test(tag));
      const canonical = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
      if (canonical !== url) throw new Error('Canonical missing or mismatched');
      console.log('[ok] canonical: ' + pathname);
    } catch (error) {
      failures.push(url + ': ' + String(error));
      console.error('[FAIL] canonical: ' + new URL(url).pathname);
    }
  }
}
if (failures.length) {
  for (const message of failures) console.error('- ' + message);
  process.exitCode = 1;
} else console.log('[SEO live audit] All sampled checks passed.');
