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
    const htmlNoStoreHeaders = [
      { key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' },
      { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
    ];

    const htmlRoutes = [
      '/',
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

    // Anime detail HTML is public and contains no server-rendered account data.
    // Keep watch/episode routes uncached, but let the CDN reuse the detail page
    // briefly so cold TTFB does not punish mobile Lighthouse or real users.
    const animeDetailHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
      { key: 'Vercel-CDN-Cache-Control', value: 'public, max-age=300, stale-while-revalidate=3600' },
      { key: 'Cloudflare-CDN-Cache-Control', value: 'public, max-age=300, stale-while-revalidate=3600' },
    ];

    return [
      ...htmlRoutes.map((source) => ({ source, headers: htmlNoStoreHeaders })),
      { source: '/anime/:slug/:path*', headers: htmlNoStoreHeaders },
      { source: '/anime/:slug', headers: animeDetailHeaders },
      { source: '/ui/:path*', headers: staticHeaders },
      { source: '/backgrounds/:path*', headers: staticHeaders },
      { source: '/brand/:path*', headers: staticHeaders },
      { source: '/og/:path*', headers: staticHeaders },
    ];
  },
};

export default nextConfig;
