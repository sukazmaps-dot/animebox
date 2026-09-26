type RecommendationFeedSkeletonProps = {
  railCount?: number;
  cardCount?: number;
  label?: string;
};

export function RecommendationCardSkeleton() {
  return (
    <div className="home-loading-card" aria-hidden="true">
      <div className="home-loading-card__poster home-loading-shimmer" />
      <div className="home-loading-card__body">
        <div className="home-loading-line home-loading-line--title home-loading-shimmer" />
        <div className="home-loading-line home-loading-line--title-short home-loading-shimmer" />
        <div className="home-loading-line home-loading-line--meta home-loading-shimmer" />
        <div className="home-loading-line home-loading-line--reason home-loading-shimmer" />
        <div className="home-loading-card__actions">
          <span className="home-loading-action home-loading-shimmer" />
          <span className="home-loading-action home-loading-action--square home-loading-shimmer" />
          <span className="home-loading-action home-loading-action--square home-loading-shimmer" />
          <span className="home-loading-action home-loading-action--square home-loading-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function RecommendationFeedSkeleton({
  railCount = 2,
  cardCount = 5,
  label = 'Загружаем персональные рекомендации',
}: RecommendationFeedSkeletonProps) {
  return (
    <div className="home-loading-feed" role="status" aria-live="polite" aria-busy="true">
      <span className="home-loading-status-copy">{label}</span>
      {Array.from({ length: railCount }).map((_, railIndex) => (
        <section className="home-loading-rail" key={`loading-rail-${railIndex}`} aria-hidden="true">
          <div className="home-loading-rail__heading">
            <span className="home-loading-badge home-loading-shimmer" />
            <span className="home-loading-heading-line home-loading-shimmer" />
          </div>
          <div className="home-loading-subtitle home-loading-shimmer" />
          <div className="home-loading-rail__track">
            {Array.from({ length: cardCount }).map((__, cardIndex) => (
              <div className="home-loading-rail__slide" key={`loading-rail-${railIndex}-card-${cardIndex}`}>
                <RecommendationCardSkeleton />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ScheduleCardSkeleton() {
  return (
    <div className="schedule__card home-loading-schedule-card" aria-hidden="true">
      <div className="home-loading-schedule-card__poster home-loading-shimmer" />
      <div className="home-loading-schedule-card__copy">
        <span className="home-loading-line home-loading-line--schedule-title home-loading-shimmer" />
        <span className="home-loading-line home-loading-line--schedule-meta home-loading-shimmer" />
      </div>
      <span className="home-loading-schedule-card__time home-loading-shimmer" />
    </div>
  );
}

export function ScheduleGridSkeleton({
  count = 4,
  label = 'Загружаем расписание',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="schedule__cards home-loading-schedule-grid" role="status" aria-live="polite" aria-busy="true">
      <span className="home-loading-status-copy">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <ScheduleCardSkeleton key={index} />
      ))}
    </div>
  );
}
