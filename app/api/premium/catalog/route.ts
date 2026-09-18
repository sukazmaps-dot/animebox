import { failure, response } from '@/lib/community-server';
import { getPremiumCatalog } from '@/lib/premium-catalog-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return response({ plans: await getPremiumCatalog() });
  } catch (error) {
    return failure(error);
  }
}
