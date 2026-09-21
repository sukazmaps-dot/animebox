import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getPublicSupabaseConfig } from '@/lib/supabase/config';

let browserClient: SupabaseClient | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getPublicSupabaseConfig();

  browserClient = createBrowserClient(url, publishableKey);

  return browserClient;
}
