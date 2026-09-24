'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';

type RatingPayload = {
  ok?: boolean;
  animeId?: number;
  average?: number | null;
  count?: number;
  myScore?: number | null;
  error?: string;
};

function formatStarScore(score: number) {
  const stars = score / 2;
  return Number.isInteger(stars) ? stars.toFixed(0) : stars.toFixed(1);
}

export default function AnimeRatingControl({
  animeId,
}: {
  animeId: number;
}) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuthState();
  const [myScore, setMyScore] = useState<number | null>(null);
  const [average, setAverage] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busyScore, setBusyScore] = useState<number | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void fetch(
      `/api/community/rating?animeId=${encodeURIComponent(String(animeId))}`,
      {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as RatingPayload;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Не удалось загрузить оценки.');
        }
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setMyScore(
          typeof payload.myScore === 'number'
            ? payload.myScore
            : null,
        );
        setAverage(
          typeof payload.average === 'number'
            ? payload.average
            : null,
        );
        setCount(
          typeof payload.count === 'number'
            ? payload.count
            : 0,
        );
      })
      .catch((error) => {
        if (!active || (error as Error).name === 'AbortError') return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось загрузить оценки.',
        );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [animeId]);

  async function saveScore(score: number) {
    if (!user || busyScore != null) return;

    setBusyScore(score);
    setMessage('');

    try {
      const response = await fetch('/api/community/rating', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ animeId, score }),
      });
      const payload = (await response.json().catch(() => ({}))) as RatingPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Не удалось сохранить оценку.');
      }

      setMyScore(score);
      setAverage(
        typeof payload.average === 'number'
          ? payload.average
          : null,
      );
      setCount(
        typeof payload.count === 'number'
          ? payload.count
          : 0,
      );
      setMessage('Оценка сохранена.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить оценку.',
      );
    } finally {
      setBusyScore(null);
    }
  }

  async function clearScore() {
    if (!user || myScore == null || busyScore != null) return;

    setBusyScore(myScore);
    setMessage('');

    try {
      const response = await fetch('/api/community/rating', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ animeId }),
      });
      const payload = (await response.json().catch(() => ({}))) as RatingPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Не удалось удалить оценку.');
      }

      setMyScore(null);
      setAverage(
        typeof payload.average === 'number'
          ? payload.average
          : null,
      );
      setCount(
        typeof payload.count === 'number'
          ? payload.count
          : 0,
      );
      setMessage('Оценка удалена.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось удалить оценку.',
      );
    } finally {
      setBusyScore(null);
    }
  }

  return (
    <section className="anime-rating-control" aria-labelledby="animebox-rating-title">
      <div className="anime-rating-control__head">
        <div>
          <span className="anime-rating-control__eyebrow">ОЦЕНКА ANIMEBOX</span>
          <h2 id="animebox-rating-title">Как тебе этот тайтл?</h2>
          <p>
            Это отдельный рейтинг сообщества AnimeBox — он не заменяет оценку AniList.
          </p>
        </div>

        <div className="anime-rating-control__summary">
          <span>Сообщество</span>
          <strong>
            {loaded && average != null
              ? `${(average / 2).toFixed(1)}★`
              : '—'}
          </strong>
          <small>
            {count > 0
              ? `${count} ${count === 1 ? 'оценка' : count < 5 ? 'оценки' : 'оценок'}`
              : 'пока без оценок'}
          </small>
        </div>
      </div>

      <div
        className="anime-rating-control__stars"
        role="group"
        aria-label="Поставить оценку от 1 до 10 звёздами"
        aria-busy={busyScore != null}
        data-disabled={!user || busyScore != null ? 'true' : 'false'}
        onPointerLeave={() => setHoverScore(null)}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const leftScore = index * 2 + 1;
          const rightScore = leftScore + 1;
          const visualScore = hoverScore ?? myScore ?? 0;
          const fillUnits = Math.max(0, Math.min(2, visualScore - index * 2));
          const fillWidth = `${fillUnits * 50}%`;

          return (
            <span
              key={leftScore}
              className="anime-rating-control__star"
              data-filled={fillUnits > 0 ? 'true' : 'false'}
            >
              <span className="anime-rating-control__star-base" aria-hidden="true">★</span>
              <span
                className="anime-rating-control__star-fill"
                aria-hidden="true"
                style={{ width: fillWidth }}
              >
                ★
              </span>
              <span className="anime-rating-control__star-hitbox">
                {[leftScore, rightScore].map((score) => (
                  <button
                    key={score}
                    type="button"
                    className="anime-rating-control__star-half"
                    disabled={!user || busyScore != null}
                    aria-label={`Поставить ${formatStarScore(score)} из 5 звёзд`}
                    aria-pressed={myScore === score}
                    title={user
                      ? `${formatStarScore(score)} из 5 звёзд`
                      : 'Войди, чтобы поставить оценку'}
                    onPointerEnter={() => setHoverScore(score)}
                    onFocus={() => setHoverScore(score)}
                    onBlur={(event) => {
                      const next = event.relatedTarget;
                      if (!(next instanceof Node) || !event.currentTarget.parentElement?.contains(next)) {
                        setHoverScore(null);
                      }
                    }}
                    onClick={() => void saveScore(score)}
                  />
                ))}
              </span>
            </span>
          );
        })}
      </div>

      <div className="anime-rating-control__footer">
        {authLoading ? (
          <span>Проверяем аккаунт…</span>
        ) : user ? (
          <span>
            {busyScore != null
              ? 'Сохраняем оценку…'
              : myScore != null
                ? <>Твоя оценка: <strong>{formatStarScore(myScore)}★</strong></>
                : 'Нажми на звезду — можно выбрать половину.'}
          </span>
        ) : (
          <span>
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
              Войди в AnimeBox
            </Link>
            {' '}чтобы поставить свою оценку.
          </span>
        )}

        {myScore != null && user && (
          <button
            type="button"
            className="anime-rating-control__clear"
            disabled={busyScore != null}
            onClick={() => void clearScore()}
          >
            Удалить оценку
          </button>
        )}
      </div>

      {message && (
        <div className="anime-rating-control__message" role="status">
          {message}
        </div>
      )}
    </section>
  );
}
