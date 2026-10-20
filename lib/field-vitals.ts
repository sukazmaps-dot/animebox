/** Privacy-safe route families only; never send titles, profile IDs or queries. */
export function performanceRouteGroup(pathname: string): string | null {
  if (pathname === '/') return '/';
  if (pathname === '/search') return '/search';
  if (pathname === '/list') return '/list';
  if (pathname === '/schedule') return '/schedule';
  if (pathname === '/leaderboard') return '/leaderboard';
  if (pathname === '/premium') return '/premium';
  if (pathname === '/chat') return '/chat';
  if (pathname === '/watch-together' || pathname === '/watch') return '/watch-together';
  if (/^\/anime\/[^/]+\/watch\/?$/.test(pathname)) return '/anime/[slug]/watch';
  if (/^\/anime\/[^/]+\/episode\/[^/]+\/?$/.test(pathname)) return '/anime/[slug]/episode/[episode]';
  if (/^\/anime\/[^/]+\/?$/.test(pathname)) return '/anime/[slug]';
  if (/^\/profile\/[^/]+\/?$/.test(pathname)) return '/profile/[id]';
  // No arbitrary route/identifier or admin path is sent to analytics.
  return null;
}

const VITAL_NAMES = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const RATINGS = new Set(['good', 'needs-improvement', 'poor']);

export function safeFieldVital(input: {
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
}): {
  metric: string;
  value: number;
  unit: 'ms' | 'milli';
  rating: string;
  navigation_type: string;
} | null {
  if (!VITAL_NAMES.has(input.name) ||
      !Number.isFinite(input.value) || input.value < 0 ||
      input.value > (input.name === 'CLS' ? 10 : 120_000)) return null;
  return {
    metric: input.name,
    // CLS is dimensionless and small; preserve meaningful precision.
    value: Math.round(input.value * (input.name === 'CLS' ? 1_000 : 1)),
    unit: input.name === 'CLS' ? 'milli' : 'ms',
    rating: RATINGS.has(input.rating ?? '') ? input.rating! : 'unknown',
    navigation_type: input.navigationType === 'navigate' ||
      input.navigationType === 'reload' ||
      input.navigationType === 'back-forward' ||
      input.navigationType === 'prerender'
      ? input.navigationType : 'other',
  };
}
