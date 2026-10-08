import 'server-only';

/** Bounds include reading the body; redirects never forward secret headers. */
export async function boundedJson(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<unknown> {
  const response = await fetch(url, {
    ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  if (!response.body) throw new Error('empty_body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128 * 1024) throw new Error('response_too_large');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
