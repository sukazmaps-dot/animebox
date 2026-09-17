import { ImageResponse } from 'next/og';

import { resolveAnimeRoute } from '@/lib/anime-route';
import { SITE_URL } from '@/lib/seo-config';

const WIDTH = 1200;
const HEIGHT = 630;

type ResolvedAnime = NonNullable<
  Awaited<ReturnType<typeof resolveAnimeRoute>>
>;

function getTitle(anime: ResolvedAnime): string {
  return (
    anime.title?.russian ||
    anime.title?.romaji ||
    anime.title?.english ||
    anime.title?.native ||
    'Аниме'
  );
}

function getOriginalTitle(anime: ResolvedAnime): string | null {
  const mainTitle = getTitle(anime);

  const original =
    anime.title?.romaji ||
    anime.title?.english ||
    anime.title?.native ||
    null;

  if (!original || original === mainTitle) {
    return null;
  }

  return original;
}

function getFormatLabel(format?: string | null): string | null {
  if (!format) {
    return null;
  }

  const labels: Record<string, string> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Фильм',
    SPECIAL: 'Спешл',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Клип',
  };

  return labels[format] || format;
}

function getYear(anime: ResolvedAnime): number | null {
  return anime.startDate?.year || null;
}

function fitTitleSize(title: string): number {
  if (title.length > 64) return 42;
  if (title.length > 48) return 48;
  if (title.length > 34) return 56;
  if (title.length > 22) return 64;
  return 72;
}

export async function createAnimeSocialImage(
  slug: string,
): Promise<ImageResponse> {
  const anime = await resolveAnimeRoute(slug);

  if (!anime) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'linear-gradient(135deg, #070711 0%, #17102f 52%, #090913 100%)',
            color: '#ffffff',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 72,
                fontWeight: 900,
                letterSpacing: 3,
              }}
            >
              ANIMEBOX
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 14,
                fontSize: 24,
                color: 'rgba(255,255,255,0.62)',
              }}
            >
              Смотри. Отслеживай. Живи.
            </div>
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
      },
    );
  }

  const title = getTitle(anime);
  const originalTitle = getOriginalTitle(anime);

  const background =
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    `${SITE_URL}/backgrounds/hero-fallback.webp`;

  const poster =
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.bannerImage ||
    `${SITE_URL}/anime-placeholder.svg`;

  const logo = `${SITE_URL}/brand/favicon.png`;

  const score =
    typeof anime.score === 'number' && Number.isFinite(anime.score)
      ? anime.score.toFixed(1)
      : null;

  const episodes =
    typeof anime.episodes === 'number' && anime.episodes > 0
      ? anime.episodes
      : null;

  const format = getFormatLabel(anime.format);
  const year = getYear(anime);

  const facts = [
    score ? `★ ${score}` : null,
    format,
    episodes ? `${episodes} сер.` : null,
    year ? String(year) : null,
  ].filter((value): value is string => Boolean(value));

  const titleFontSize = fitTitleSize(title);

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          overflow: 'hidden',
          background: '#080912',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <img
          src={background}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.34,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(90deg, rgba(5,5,13,0.98) 0%, rgba(8,7,20,0.96) 43%, rgba(13,8,29,0.78) 72%, rgba(7,7,15,0.86) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -220,
            width: 650,
            height: 650,
            display: 'flex',
            borderRadius: 650,
            background:
              'radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0) 72%)',
          }}
        />

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '50px 60px 42px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 58,
            }}
          >
            <img
              src={logo}
              alt=""
              width={48}
              height={48}
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginLeft: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 25,
                  fontWeight: 900,
                  letterSpacing: 2.2,
                }}
              >
                ANIMEBOX
              </div>

              <div
                style={{
                  display: 'flex',
                  marginTop: 2,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.56)',
                }}
              >
                Смотри. Отслеживай. Живи.
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              marginTop: 20,
            }}
          >
            <div
              style={{
                width: 208,
                height: 312,
                display: 'flex',
                flexShrink: 0,
                overflow: 'hidden',
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <img
                src={poster}
                alt=""
                width={208}
                height={312}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                marginLeft: 42,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  maxWidth: 780,
                  fontSize: titleFontSize,
                  lineHeight: 1.02,
                  fontWeight: 900,
                  letterSpacing: -1.8,
                }}
              >
                {title}
              </div>

              {originalTitle ? (
                <div
                  style={{
                    display: 'flex',
                    maxWidth: 740,
                    marginTop: 13,
                    fontSize: 22,
                    lineHeight: 1.2,
                    color: 'rgba(255,255,255,0.52)',
                  }}
                >
                  {originalTitle}
                </div>
              ) : null}

              {facts.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginTop: 27,
                    fontSize: 19,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.88)',
                  }}
                >
                  {facts.map((fact, index) => (
                    <div
                      key={`${fact}-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {index > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            margin: '0 11px',
                            color: 'rgba(255,255,255,0.26)',
                          }}
                        >
                          •
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: 'flex',
                          color:
                            fact.startsWith('★')
                              ? '#fbbf24'
                              : 'rgba(255,255,255,0.88)',
                        }}
                      >
                        {fact}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: 28,
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.76)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    marginRight: 9,
                    color: '#a78bfa',
                  }}
                >
                  ✦
                </div>

                Смотри • Отслеживай • Сохраняй прогресс
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              width: '100%',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 1.7,
              color: 'rgba(255,255,255,0.36)',
            }}
          >
            YOURANIMEBOX.COM
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );
}
