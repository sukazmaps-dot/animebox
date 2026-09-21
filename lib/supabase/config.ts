const FALLBACK_SUPABASE_URL =
  'https://liwhdayjdiebxmunphma.supabase.co';

const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_e23YhEFubdY80kk8XYU5CQ_4i9CPMlw';

let warnedAboutFallback = false;

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
  source: 'environment' | 'fallback';
};

function readPublicEnv(name: string): string | null {
  const value =
    name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : name === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
        ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * Public Supabase config used by browser + SSR clients.
 *
 * NEXT_PUBLIC_* values are intentionally public and are bundled into the
 * browser by Next.js. The fallback therefore contains ONLY the project URL and
 * Supabase publishable key. Never place a service-role/secret key here.
 *
 * Why keep a fallback?
 * Some secondary build environments (for example an accidental Cloudflare
 * Workers build) can prerender Client Components without inheriting Vercel's
 * environment variables. @supabase/ssr throws immediately in that case,
 * causing even /_not-found to fail during next build.
 */
export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const envUrl = readPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const envPublishableKey =
    readPublicEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const url = envUrl ?? FALLBACK_SUPABASE_URL;
  const publishableKey =
    envPublishableKey ?? FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  if ((!envUrl || !envPublishableKey) && !warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      '[AnimeBox Config] Supabase public env is incomplete. ' +
        'Using the built-in public project fallback for this build/runtime. ' +
        'Configure NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the primary deployment environment.',
    );
  }

  return {
    url,
    publishableKey,
    source:
      envUrl && envPublishableKey
        ? 'environment'
        : 'fallback',
  };
}
