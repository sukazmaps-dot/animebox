import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createClient,
} from '@/lib/supabase/server';
import { adminClient } from '@/lib/community-server';
import { getSponsorStatuses } from '@/lib/sponsor-server';
import { assertCanComment } from '@/lib/admin-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import { studioSettingsFromRow } from '@/lib/premium-studio';

const MAX_COMMENT_LENGTH = 4000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/* ========================================================
   TYPES
   ======================================================== */

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_path: string | null;
};

type PremiumProfileRow = {
  user_id: string;
  avatar_path: string | null;
  avatar_static_path: string | null;
};


/* ========================================================
   HELPERS
   ======================================================== */

/*
 * Комментарии храним как plain text.
 *
 * React безопасно экранирует:
 *
 * <p>{comment.body}</p>
 *
 * Поэтому dangerouslySetInnerHTML
 * для комментариев использовать нельзя.
 */
function sanitizePlainText(
  value: string,
) {
  return value
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
      '',
    )
    .replace(/\r\n?/g, '\n')
    .trim();
}


function parsePositiveInteger(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}


/*
 * Превращаем avatar_path в URL.
 *
 * Если в БД почему-то уже лежит полный URL,
 * второй раз через Storage его не пропускаем.
 */
function getAvatarUrl(
  supabase: ReturnType<typeof adminClient>,
  avatarPath: string | null,
) {
  if (!avatarPath) {
    return null;
  }

  if (
    avatarPath.startsWith('http://') ||
    avatarPath.startsWith('https://')
  ) {
    return avatarPath;
  }

  const {
    data,
  } = supabase.storage
    .from('profile-media')
    .getPublicUrl(
      avatarPath,
    );

  return (
    data.publicUrl ||
    null
  );
}


/* ========================================================
   GET

   /api/comments?anime_id=154587&episode=13
   ======================================================== */

export async function GET(
  request: NextRequest,
) {
  try {
    const animeId =
      parsePositiveInteger(
        request.nextUrl.searchParams.get(
          'anime_id',
        ),
      );

    const episode =
      parsePositiveInteger(
        request.nextUrl.searchParams.get(
          'episode',
        ),
      );


    if (!animeId || !episode) {
      return NextResponse.json(
        {
          error:
            'Некорректный anime_id или episode.',
        },
        {
          status: 400,
        },
      );
    }


    const supabase =
      await createClient();


    /* =====================================================
       1. Загружаем комментарии конкретной серии
       ===================================================== */

    const {
      data: comments,
      error: commentsError,
    } = await supabase
      .from('comments')
      .select(`
        id,
        anime_id,
        episode_number,
        user_id,
        parent_id,
        depth,
        body,
        is_spoiler,
        created_at,
        deleted_at
      `)
      .eq(
        'anime_id',
        animeId,
      )
      .eq(
        'episode_number',
        episode,
      )
      .order(
        'created_at',
        {
          ascending: true,
        },
      );


    if (commentsError) {
      console.error(
        '[GET COMMENTS]',
        commentsError,
      );

      return NextResponse.json(
        {
          error:
            'Не удалось загрузить комментарии.',
        },
        {
          status: 500,
        },
      );
    }


    const rows =
      comments ?? [];


    /* =====================================================
       2. Собираем уникальные user_id авторов
       ===================================================== */

    const userIds =
      [
        ...new Set(
          rows
            .map(
              (comment) =>
                comment.user_id,
            )
            .filter(
              (
                id,
              ): id is string =>
                typeof id ===
                  'string' &&
                id.length > 0,
            ),
        ),
      ];


    /* =====================================================
       3. Одним запросом получаем профили

       Важно:
       НЕ делаем отдельный запрос для каждого комментария.
       ===================================================== */

    let profiles:
      ProfileRow[] = [];

    const ogByUser =
      new Map<string, number>();

    let sponsorByUser =
      new Map<string, import('@/lib/sponsor').SponsorStatus>();

    let profileClient:
      ReturnType<typeof adminClient> | null = null;

    const premiumSettingsByUser =
      new Map<string, PremiumProfileRow>();

    const premiumActiveUsers =
      new Set<string>();


    if (userIds.length > 0) {
      try {
        /*
         * profiles закрыта RLS для чтения чужих аккаунтов.
         * Декорируем комментарии только на сервере через service_role,
         * не открывая таблицу браузеру.
         */
        profileClient = adminClient();

        const nowIso = new Date().toISOString();

        const [
          profileResult,
          ogResult,
          sponsorResult,
          premiumSettingsResult,
          premiumSubscriptionsResult,
        ] = await Promise.all([
          profileClient
            .from('profiles')
            .select(`
              id,
              username,
              avatar_path
            `)
            .in(
              'id',
              userIds,
            ),
          profileClient
            .from('og_members')
            .select('user_id,og_number')
            .in(
              'user_id',
              userIds,
            ),
          getSponsorStatuses(userIds),
          profileClient
            .from('premium_profile_settings')
            .select('user_id,avatar_path,avatar_static_path')
            .in('user_id', userIds),
          profileClient
            .from('premium_subscriptions')
            .select('user_id')
            .in('user_id', userIds)
            .in('status', ['active', 'grace_period'])
            .gt('ends_at', nowIso),
        ]);

        sponsorByUser = sponsorResult;

        if (premiumSettingsResult.error) {
          console.error(
            '[GET COMMENT PREMIUM SETTINGS]',
            premiumSettingsResult.error,
          );
        } else {
          for (const row of premiumSettingsResult.data ?? []) {
            premiumSettingsByUser.set(
              String(row.user_id),
              row as PremiumProfileRow,
            );
          }
        }

        if (premiumSubscriptionsResult.error) {
          console.error(
            '[GET COMMENT PREMIUM STATUS]',
            premiumSubscriptionsResult.error,
          );
        } else {
          for (const row of premiumSubscriptionsResult.data ?? []) {
            premiumActiveUsers.add(String(row.user_id));
          }
        }


        if (profileResult.error) {
          console.error(
            '[GET COMMENT PROFILES]',
            profileResult.error,
          );
        } else {
          profiles =
            (profileResult.data ??
              []) as ProfileRow[];
        }

        if (ogResult.error) {
          console.error(
            '[GET COMMENT OG BADGES]',
            ogResult.error,
          );
        } else {
          for (const row of
            ogResult.data ?? []) {
            if (
              typeof row.og_number ===
                'number'
            ) {
              ogByUser.set(
                row.user_id,
                row.og_number,
              );
            }
          }
        }
      } catch (profileError) {
        console.error(
          '[GET COMMENT PROFILES]',
          profileError,
        );
      }
    }


    /* =====================================================
       4. Создаём Map профилей

       user_id -> profile

       Так поиск автора происходит за O(1).
       ===================================================== */

    const profileMap =
      new Map<
        string,
        ProfileRow
      >(
        profiles.map(
          (profile) => [
            profile.id,
            profile,
          ],
        ),
      );


    /* =====================================================
       5. Прикрепляем author к каждому комментарию
       ===================================================== */

    const result =
      rows.map(
        (comment) => {
          const profile =
            comment.user_id
              ? profileMap.get(
                  comment.user_id,
                )
              : undefined;


          const premiumRow =
            comment.user_id
              ? premiumSettingsByUser.get(comment.user_id) ?? null
              : null;

          const appearance = profile
            ? resolveProfileAppearance({
                baseAvatarPath: profile.avatar_path,
                baseBannerPath: null,
                premiumStudio: premiumRow
                  ? studioSettingsFromRow(premiumRow as unknown as Record<string, unknown>)
                  : null,
                premiumActive: Boolean(
                  comment.user_id && premiumActiveUsers.has(comment.user_id),
                ),
              })
            : null;

          const avatarUrl =
            appearance && profileClient
              ? getAvatarUrl(
                  profileClient,
                  appearance.avatarPath,
                )
              : null;


          return {
            ...comment,

            author: profile
              ? {
                  username:
                    profile.username,

                  avatarUrl,

                  ogNumber:
                    comment.user_id
                      ? ogByUser.get(
                          comment.user_id,
                        ) ?? null
                      : null,

                  sponsor:
                    comment.user_id
                      ? sponsorByUser.get(
                          comment.user_id,
                        ) ?? null
                      : null,

                  role:
                    comment.user_id
                      ? publicIdentityRoleFor(comment.user_id)
                      : null,
                }
              : null,
          };
        },
      );


    /* =====================================================
       6. Отдаём комментарии + профиль автора
       ===================================================== */

    return NextResponse.json(
      {
        comments:
          result,
      },
      {
        headers: {
          /*
           * Комментарии меняются часто,
           * поэтому долгий CDN cache здесь не нужен.
           */
          'Cache-Control':
            'private, no-cache',
        },
      },
    );

  } catch (error) {
    console.error(
      '[GET COMMENTS API]',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Внутренняя ошибка при загрузке комментариев.',
      },
      {
        status: 500,
      },
    );
  }
}


/* ========================================================
   POST

   /api/comments
   ======================================================== */

export async function POST(
  request: NextRequest,
) {
  try {
    const supabase =
      await createClient();


    /* =====================================================
       Проверяем авторизацию
       ===================================================== */

    const {
      data: {
        user,
      },
      error: authError,
    } =
      await supabase.auth.getUser();


    if (authError) {
      console.error(
        '[COMMENTS AUTH]',
        authError,
      );
    }


    if (!user) {
      return NextResponse.json(
        {
          error:
            'Необходимо войти в аккаунт.',
        },
        {
          status: 401,
        },
      );
    }

    await assertCanComment(user.id);


    /* =====================================================
       Payload
       ===================================================== */

    let payload:
      Record<string, unknown>;


    try {
      payload =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            'Некорректный JSON.',
        },
        {
          status: 400,
        },
      );
    }


    const animeId =
      Number(
        payload.animeId,
      );


    const episode =
      Number(
        payload.episode,
      );


    const parentId =
      payload.parentId ??
      null;


    const isSpoiler =
      Boolean(
        payload.isSpoiler,
      );


    const rawBody =
      typeof payload.body ===
      'string'
        ? payload.body
        : '';


    const body =
      sanitizePlainText(
        rawBody,
      );


    /* =====================================================
       Проверяем anime ID

       Здесь animeId должен быть именно AniList ID.
       ===================================================== */

    if (
      !Number.isSafeInteger(
        animeId,
      ) ||
      animeId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'Некорректный animeId.',
        },
        {
          status: 400,
        },
      );
    }


    /* =====================================================
       Проверяем номер серии
       ===================================================== */

    if (
      !Number.isSafeInteger(
        episode,
      ) ||
      episode <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'Некорректная серия.',
        },
        {
          status: 400,
        },
      );
    }


    /* =====================================================
       Проверяем текст
       ===================================================== */

    if (!body) {
      return NextResponse.json(
        {
          error:
            'Комментарий пуст.',
        },
        {
          status: 400,
        },
      );
    }


    if (
      [...body].length >
      MAX_COMMENT_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            `Максимум ${MAX_COMMENT_LENGTH} символов.`,
        },
        {
          status: 400,
        },
      );
    }


    /* =====================================================
       Проверяем parent_id
       ===================================================== */

    if (
      parentId !== null &&
      (
        typeof parentId !==
          'string' ||
        !UUID_RE.test(
          parentId,
        )
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Некорректный parentId.',
        },
        {
          status: 400,
        },
      );
    }


    const requestId =
      crypto.randomUUID();


    /* =====================================================
       Создаём комментарий

       Здесь НЕТ запросов к AniList/Shikimori.
       Комментарии от внешних API не зависят.
       ===================================================== */

    const {
      data,
      error,
    } =
      await supabase.rpc(
        'create_episode_comment',
        {
          p_anime:
            animeId,

          p_episode:
            episode,

          p_body:
            body,

          p_spoiler:
            isSpoiler,

          p_parent:
            parentId,

          p_request:
            requestId,
        },
      );


    if (error) {
      console.error(
        '[POST COMMENT]',
        error,
      );


      /* ===================================================
         Rate limit
         =================================================== */

      if (
        error.message.includes(
          'RATE_LIMIT',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Подожди несколько секунд перед следующим сообщением.',
          },
          {
            status: 429,
          },
        );
      }


      /* ===================================================
         Максимальная глубина ответов
         =================================================== */

      if (
        error.message.includes(
          'MAX_DEPTH',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Достигнута максимальная глубина ответов.',
          },
          {
            status: 400,
          },
        );
      }


      /* ===================================================
         Родитель из другой серии
         =================================================== */

      if (
        error.message.includes(
          'INVALID_PARENT_EPISODE',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Нельзя ответить на комментарий из другой серии.',
          },
          {
            status: 400,
          },
        );
      }


      /* ===================================================
         Родитель не найден
         =================================================== */

      if (
        error.message.includes(
          'PARENT_NOT_FOUND',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Комментарий, на который ты отвечаешь, больше не существует.',
          },
          {
            status: 404,
          },
        );
      }


      return NextResponse.json(
        {
          error:
            'Не удалось отправить комментарий.',
        },
        {
          status: 500,
        },
      );
    }


    /* =====================================================
       Дополнительно возвращаем профиль автора.

       Это полезно, если потом захочешь добавлять
       комментарий в UI мгновенно без повторного GET.
       ===================================================== */

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from('profiles')
        .select(`
          id,
          username,
          avatar_path
        `)
        .eq(
          'id',
          user.id,
        )
        .maybeSingle();


    if (profileError) {
      console.error(
        '[POST COMMENT PROFILE]',
        profileError,
      );
    }


    const avatarUrl =
      profile
        ? getAvatarUrl(
            supabase,
            profile.avatar_path,
          )
        : null;


    return NextResponse.json(
      {
        comment: {
          ...data,

          author: profile
            ? {
                username:
                  profile.username,

                avatarUrl,
              }
            : null,
        },
      },
      {
        status: 201,
      },
    );

  } catch (error) {
    console.error(
      '[COMMENTS API]',
      error,
    );


    return NextResponse.json(
      {
        error:
          'Внутренняя ошибка сервера.',
      },
      {
        status: 500,
      },
    );
  }
}
