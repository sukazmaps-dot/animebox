import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // One canonical URL style: /anime/title-id (without a trailing slash).
  trailingSlash: false,
  poweredByHeader: false,
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
      '/anime/:path*',
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
      { key: 'Cache-Control', value: 'public, max-age=3600' },
      {
        key: 'Vercel-CDN-Cache-Control',
        value: 'public, max-age=604800, stale-while-revalidate=86400',
      },
    ];

    return [
      ...htmlRoutes.map((source) => ({ source, headers: htmlNoStoreHeaders })),
      { source: '/ui/:path*', headers: staticHeaders },
      { source: '/backgrounds/:path*', headers: staticHeaders },
    ];
  },
};

export default nextConfig;
