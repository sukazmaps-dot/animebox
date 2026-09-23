const INTERNAL_BASE = 'https://animebox.invalid';

export function safeInternalPath(
  value: string | null | undefined,
  fallback = '/',
) {
  if (typeof value !== 'string') return fallback;

  const candidate = value.trim();

  if (
    !candidate ||
    candidate.length > 1024 ||
    !candidate.startsWith('/') ||
    /[\u0000-\u001f\u007f\\]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const base = new URL(INTERNAL_BASE);
    const parsed = new URL(candidate, base);

    if (parsed.origin !== base.origin) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
