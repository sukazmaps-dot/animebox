// Short-lived hints for this tab only. No persistence, image bytes or requests.
const SUCCESS_TTL_MS = 120_000;
const MAX_SUCCESS_HINTS = 128;
const successes = new Map<string, {source: string; expiresAt: number}>();

export function rememberImageSuccess(sources: string[], source: string) {
  const key = sources[0];
  if (!key || !sources.includes(source)) return;
  successes.delete(key);
  successes.set(key, {source, expiresAt: Date.now() + SUCCESS_TTL_MS});
  while (successes.size > MAX_SUCCESS_HINTS) successes.delete(successes.keys().next().value!);
}

export function rememberedImageSource(sources: string[]) {
  const key = sources[0];
  const entry = successes.get(key);
  if (!entry) return -1;
  if (entry.expiresAt <= Date.now() || !sources.includes(entry.source)) {
    return -1;
  }
  return sources.indexOf(entry.source);
}

export function forgetImageSuccess(sources: string[], source: string) {
  if (successes.get(sources[0])?.source === source) successes.delete(sources[0]);
}
