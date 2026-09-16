import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
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