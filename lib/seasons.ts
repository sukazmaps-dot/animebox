export type SeasonPeriod = 'week' | 'month';

export type SeasonPlacement = {
  place: number;
  periodType: SeasonPeriod;
  periodKey: string;
  startsAt: string;
  endsAt: string;
};

export function seasonPlacementLabel(place: number, period: SeasonPeriod) {
  const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
  const periodLabel = period === 'week' ? 'недели' : 'месяца';

  if (place === 1) return `${medal} Лидер ${periodLabel}`;
  return `${medal} #${place} ${periodLabel}`;
}

export function formatSeasonRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const exclusiveEnd = new Date(endsAt);
  const end = new Date(exclusiveEnd.getTime() - 1);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return '';
  }

  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(end);

    if (start.getUTCDate() === 1 && end.getUTCDate() >= 27) {
      return monthYear;
    }

    return `${start.getUTCDate()}–${end.getUTCDate()} ${monthYear}`;
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
