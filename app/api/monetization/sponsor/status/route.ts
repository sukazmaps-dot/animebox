import { ApiError, failure, response } from '@/lib/community-server';
import { getSponsorStatuses } from '@/lib/sponsor-server';

// Public cosmetics only. Financial amounts and payment history stay private.
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get('ids') ?? '';
    const ids = [...new Set(raw.split(',').filter(Boolean))];
    if (
      !ids.length ||
      ids.length > 50 ||
      ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    ) {
      throw new ApiError(400, 'Нужно от 1 до 50 UUID.');
    }

    const statuses = await getSponsorStatuses(ids);
    return response({
      statuses: Object.fromEntries(
        ids.map((id) => {
          const sponsor = statuses.get(id) ?? null;
          return [id, sponsor ? { tier: sponsor.tier, cosmetics: sponsor.cosmetics } : { tier: null }];
        }),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
