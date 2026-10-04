// Shared by the build and gateway. Match only complete path segments.
export const groups = [
  { name: 'social_images', prefixes: [] },
  { name: 'api_admin', prefixes: ['/api/admin', '/api/cron'] },
  { name: 'api_catalog', prefixes: ['/api/anime', '/api/anilist', '/api/shikimori', '/api/search', '/api/catalog', '/api/recommendations', '/api/discovery', '/api/schedule', '/api/anilibria'] },
  { name: 'api_watch', prefixes: ['/api/watch-party', '/api/watch', '/api/player', '/api/episodes', '/api/playback'] },
  { name: 'api_social', prefixes: ['/api/community', '/api/profile', '/api/profiles', '/api/comments', '/api/leaderboard', '/api/achievements', '/api/notifications'] },
  { name: 'api_other', prefixes: ['/api'] },
  { name: 'pages_admin', prefixes: ['/admin'] },
  { name: 'pages_account', prefixes: ['/profile', '/settings', '/list', '/favorites', '/login', '/register', '/auth', '/onboarding', '/notifications'] },
  { name: 'pages_watch', prefixes: ['/watch', '/anime'] },
];
export function selectGroup(pathname) {
  if (/^\/anime\/[^/]+\/(opengraph-image|twitter-image)(\/|$)/.test(pathname)) return 'social_images';
  return groups.find(({ prefixes }) => prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/')))?.name ?? 'default';
}
export function bindingFor(name) { return 'SERVER_' + name.toUpperCase(); }
