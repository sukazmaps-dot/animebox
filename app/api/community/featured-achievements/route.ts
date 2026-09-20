import { ApiError, failure, readBody, response, userClient } from '@/lib/community-server';

function achievementCodes(value: unknown) {
  if (!Array.isArray(value) || value.length > 3) {
    throw new ApiError(400, 'Можно выбрать не больше трёх достижений.');
  }

  const codes = value.map((item) => {
    if (typeof item !== 'string') {
      throw new ApiError(400, 'Некорректное достижение.');
    }

    const code = item.trim();
    if (!code || code.length > 80) {
      throw new ApiError(400, 'Некорректное достижение.');
    }

    return code;
  });

  if (new Set(codes).size !== codes.length) {
    throw new ApiError(400, 'Достижение выбрано дважды.');
  }

  return codes;
}

export async function PUT(request: Request) {
  try {
    const { client } = await userClient();
    const body = await readBody(request);
    const codes = achievementCodes(body.codes);

    const { error } = await client.rpc('set_featured_achievements', {
      p_codes: codes,
    });

    if (error) {
      if (/ACHIEVEMENT_NOT_EARNED/i.test(error.message)) {
        throw new ApiError(400, 'В витрину можно добавить только полученные достижения.');
      }
      throw error;
    }

    return response({ success: true, codes });
  } catch (error) {
    return failure(error);
  }
}
