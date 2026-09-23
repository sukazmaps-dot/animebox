import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'auth_tg_nonce_ip',
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const nonce =
    randomBytes(32).toString('base64url');

  const response =
    NextResponse.json(
      {
        ok: true,
        nonce,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      },
    );

  response.cookies.set(
    'animebox_tg_nonce',
    nonce,
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        'production',

      sameSite: 'lax',

      path:
        '/api/auth/telegram',

      maxAge:
        5 * 60,
    },
  );

  return response;
}