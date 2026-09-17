import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getSponsorStatus } from '@/lib/sponsor-server';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ sponsor: null }, { status: 401 });
  }

  return NextResponse.json(
    {
      sponsor: await getSponsorStatus(data.user.id),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
