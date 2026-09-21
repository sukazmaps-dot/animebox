import {
  WATCH_PARTY_MAX_PARTICIPANTS,
  WATCH_PARTY_PROTOCOL,
} from '@/lib/watch-party';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return Response.json(
    {
      ok: true,
      build: 'patch-9.2-auth-bootstrap',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      protocol: WATCH_PARTY_PROTOCOL,
      maxParticipants: WATCH_PARTY_MAX_PARTICIPANTS,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
