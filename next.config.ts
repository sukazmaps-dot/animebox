import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // One canonical URL style: /anime/title-id (without a trailing slash).
  trailingSlash: false,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.youranimebox.com',
          },
        ],
        destination: 'https://youranimebox.com/:path*',
        permanent: true,
      },
    ];
  },

  images: {
    imageSizes: [32, 48, 64, 96, 128, 160, 192, 224, 256, 288, 320, 384],
    qualities: [50, 55, 60, 62, 68, 70, 75, 82, 88],
    minimumCacheTTL: 2_592_000,
    remotePatterns: [
      { protocol: 'https', hostname: '**.shikimori.one' },
      { protocol: 'https', hostname: '**.shikimori.me' },
      { protocol: 'https', hostname: 'cdn.anilist.co' },
      { protocol: 'https', hostname: 's1.anilist.co' },
      { protocol: 'https', hostname: 's2.anilist.co' },
      { protocol: 'https', hostname: 's3.anilist.co' },
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'cdn.myanimelist.net' },
      { protocol: 'https', hostname: 'api.jikan.moe' },
      { protocol: 'https', hostname: '**.jikan.moe' },
    ],
  },

  async headers() {
    const securityHeaders = [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      },
      {
        // AnimeBox is never intended to be embedded as a page. Keep this
        // directive isolated from the future full CSP so player/auth provider
        // inventories cannot accidentally delay clickjacking protection.
        key: 'Content-Security-Policy',
        value: "frame-ancestors 'none';",
      },
      {
        // Legacy anti-framing fallback for clients that do not enforce
        // CSP frame-ancestors.
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Cross-Origin-Opener-Policy',
        value: 'same-origin-allow-popups',
      },
      {
        key: 'X-Permitted-Cross-Domain-Policies',
        value: 'none',
      },
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(), payment=(), usb=()',
      },
    ];

    const htmlNoStoreHeaders = [
      { key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' },
      { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
    ];

    const htmlRoutes = [
      '/search/:path*',
      '/schedule/:path*',
      '/list/:path*',
      '/favorites/:path*',
      '/leaderboard/:path*',
      '/notifications/:path*',
      '/about/:path*',
      '/support/:path*',
      '/supporters/:path*',
      '/premium/:path*',
      '/profile/:path*',
      '/settings/:path*',
      '/login/:path*',
      '/register/:path*',
      '/onboarding/:path*',
      '/auth/:path*',
      '/admin/:path*',
    ];

    const staticHeaders = [
      // Brand assets are versioned by deploy and change rarely. A longer
      // browser TTL avoids paying the same image/icon cost on every visit.
      { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
      {
        key: 'Vercel-CDN-Cache-Control',
        value: 'public, max-age=2592000, stale-while-revalidate=604800',
      },
      {
        key: 'Cloudflare-CDN-Cache-Control',
        value: 'public, max-age=2592000, stale-while-revalidate=604800',
      },
    ];

    // The Home route is public SSR/ISR. Account/profile/watch state is hydrated
    // entirely on the client, so caching this shared HTML cannot leak user data.
    // Keep it aligned with app/page.tsx revalidate=900 instead of defeating ISR
    // with the old no-store rule.
    const homeHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600' },
      { key: 'Vercel-CDN-Cache-Control', value: 'public, max-age=900, stale-while-revalidate=3600' },
      { key: 'Cloudflare-CDN-Cache-Control', value: 'public, max-age=900, stale-while-revalidate=3600' },
    ];

    // Anime detail HTML is public and contains no server-rendered account data.
    // Keep watch/episode routes uncached, but let the CDN reuse the detail page
    // briefly so cold TTFB does not punish mobile Lighthouse or real users.
    const animeDetailHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
      { key: 'Vercel-CDN-Cache-Control', value: 'public, max-age=300, stale-while-revalidate=3600' },
      { key: 'Cloudflare-CDN-Cache-Control', value: 'public, max-age=300, stale-while-revalidate=3600' },
    ];

    return [
      { source: '/:path*', headers: securityHeaders },
      ...htmlRoutes.map((source) => ({ source, headers: htmlNoStoreHeaders })),
      { source: '/', headers: homeHeaders },
      { source: '/anime/:slug/:path*', headers: htmlNoStoreHeaders },
      { source: '/anime/:slug', headers: animeDetailHeaders },
      { source: '/ui/:path*', headers: staticHeaders },
      { source: '/premium/:path*', headers: staticHeaders },
      { source: '/backgrounds/:path*', headers: staticHeaders },
      { source: '/brand/:path*', headers: staticHeaders },
      { source: '/og/:path*', headers: staticHeaders },
      {
        source: '/animebox-sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
