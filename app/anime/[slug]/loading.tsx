import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';

export default function LoadingAnime() {
  return (
    <main className="detail animebox-anime-loading" aria-busy="true">
      <section className="animebox-anime-loading__card" role="status" aria-live="polite">
        <span className="animebox-anime-loading__eyebrow">ANIMEBOX CINEMA</span>
        <AnimeBoxLoader label="Загружаем аниме…" size={64} />
        <p className="animebox-anime-loading__hint">
          Подготавливаем страницу, серии и доступные источники.
        </p>
      </section>
    </main>
  );
}
