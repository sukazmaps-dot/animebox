import sharp from 'sharp';
import { pathToFileURL } from 'node:url';

export async function inspectPoster(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(mime)) {
    throw new Error('Expected a raster poster; HTML/SVG placeholders do not count as success.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty image body.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) throw new Error('Poster exceeds 8 MiB.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
  const meta = await image.metadata();
  await image.stats(); // Decode pixels; metadata alone can accept truncated bodies.
  if (!meta.width || !meta.height || !['jpeg', 'png', 'webp', 'avif', 'heif', 'gif'].includes(meta.format)) {
    throw new Error('Invalid raster poster.');
  }
  const expected = { 'image/jpeg': ['jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/avif': ['avif', 'heif'], 'image/gif': ['gif'] };
  if (!expected[mime].includes(meta.format)) throw new Error('MIME does not match image bytes.');
  return { width: meta.width, height: meta.height, format: meta.format, bytes: size };
}

export async function smokePoster(source, fetchImpl = fetch) {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a public HTTPS poster URL.');
  const targets = [
    ['media', new URL('/image', 'https://media.youranimebox.com')],
    ['same-origin', new URL('/api/image', 'https://youranimebox.com')],
  ];
  const results = [];
  for (const [route, target] of targets) {
    target.searchParams.set('url', url.href);
    if (route === 'media') { target.searchParams.set('w', '360'); target.searchParams.set('q', '70'); target.searchParams.set('f', 'webp'); }
    let diagnostics = {};
    try {
      const response = await fetchImpl(target, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
      diagnostics = { status: response.status, mediaState: response.headers.get('x-animebox-media'),
        originError: response.headers.get('x-animebox-origin-error') };
      results.push({ route, ok: true, ...diagnostics, ...await inspectPoster(response) });
    } catch (error) { results.push({ route, ok: false, ...diagnostics, error: error.name === 'TimeoutError' ? 'timeout' : error.message }); }
  }
  return { sourceHost: url.hostname, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sources = process.argv.slice(2);
  if (!sources.length || sources.length > 6) {
    console.error('Usage: node scripts/media-poster-smoke.mjs HTTPS_POSTER_URL [up to 6 URLs]');
    process.exitCode = 1;
  } else {
    for (const source of sources) {
      try {
        const result = await smokePoster(source);
        console.log(JSON.stringify(result, null, 2));
        if (result.results.some(item => !item.ok)) process.exitCode = 1;
      } catch { console.error('Invalid poster URL.'); process.exitCode = 1; }
    }
  }
}
