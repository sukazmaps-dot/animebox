import {
  ApiError,
  failure,
  positiveInteger,
  response,
  userClient,
} from '@/lib/community-server';
import { getCompletedEpisodes } from '@/lib/watch-server';

export async function GET(request: Request) {
  try {
    const animeId = positiveInteger(
      Number(new URL(request.url).searchParams.get('animeId')),
    );

    const { user } = await userClient();
    const episodes = await getCompletedEpisodes(user.id, animeId);

    return response({ episodes });
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  return failure(
    new ApiError(
      410,
      'Ручные отметки серий отключены. AnimeBox засчитывает серию автоматически после подтверждённого просмотра.',
    ),
  );
}
