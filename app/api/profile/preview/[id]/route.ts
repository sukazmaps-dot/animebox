import { failure, response } from '@/lib/community-server';
import { getProfilePreview } from '@/lib/profile-preview-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const preview = await getProfilePreview(id);

    if (!preview) {
      return response({ error: 'Профиль не найден.' }, 404);
    }

    return response(preview);
  } catch (error) {
    return failure(error);
  }
}
