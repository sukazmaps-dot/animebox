import { resolvePublicAuthConfig } from '@/lib/public-auth-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(resolvePublicAuthConfig(process.env), {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
