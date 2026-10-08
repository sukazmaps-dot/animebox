const CANONICAL_ORIGINS = new Set([
  'https://youranimebox.com',
  'https://www.youranimebox.com',
]);

export function isProductionDeployment(
  env: { VERCEL_ENV?: string; NODE_ENV?: string } = process.env,
) {
  // Preserve Vercel preview isolation; Railway has no VERCEL_ENV.
  return env.VERCEL_ENV
    ? env.VERCEL_ENV === 'production'
    : env.NODE_ENV === 'production';
}

export function isAllowedBrowserOrigin(
  request: Request,
  origin: string,
  production = isProductionDeployment(),
) {
  try {
    const parsed = new URL(origin);
    // Origin is an origin, not an arbitrary URL or a forwarded host header.
    if (origin !== parsed.origin) return false;
    return production
      ? CANONICAL_ORIGINS.has(parsed.origin)
      : parsed.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
