export default function LoadingAnime() {
  return (
    <main
      className="anime-detail-v3 anime-detail-v4 min-h-screen overflow-hidden bg-[#08080c] text-white"
      aria-busy="true"
    >
      <section
        className="anime-detail-v4__hero-shell relative overflow-hidden"
        role="status"
        aria-live="polite"
        aria-label="Загружаем страницу аниме"
      >
        <div className="relative mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-16">
          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[230px_minmax(0,1fr)] md:items-stretch lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
            <div className="aspect-[2/3] animate-pulse rounded-xl border border-white/10 bg-white/[0.055] motion-reduce:animate-none md:min-h-[420px] md:aspect-auto" />

            <div className="min-w-0 py-1">
              <div className="mb-5 h-3 w-32 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />

              <div className="mb-4 flex gap-2" aria-hidden="true">
                <span className="h-7 w-16 animate-pulse rounded-full bg-white/[0.07] motion-reduce:animate-none" />
                <span className="h-7 w-24 animate-pulse rounded-full bg-white/[0.07] motion-reduce:animate-none" />
              </div>

              <div className="h-10 w-[min(560px,86%)] animate-pulse rounded-lg bg-white/[0.08] motion-reduce:animate-none md:h-14" />
              <div className="mt-3 h-5 w-[min(360px,64%)] animate-pulse rounded-md bg-white/[0.05] motion-reduce:animate-none" />

              <div className="mt-7 space-y-3" aria-hidden="true">
                <div className="h-3.5 w-full max-w-3xl animate-pulse rounded bg-white/[0.055] motion-reduce:animate-none" />
                <div className="h-3.5 w-[92%] max-w-3xl animate-pulse rounded bg-white/[0.055] motion-reduce:animate-none" />
                <div className="h-3.5 w-[72%] max-w-3xl animate-pulse rounded bg-white/[0.055] motion-reduce:animate-none" />
              </div>

              <div className="mt-7 flex flex-wrap gap-3" aria-hidden="true">
                <span className="h-10 w-24 animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none" />
                <span className="h-10 w-32 animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none" />
              </div>

              <div className="mt-7 flex flex-wrap gap-3" aria-hidden="true">
                <span className="h-11 w-36 animate-pulse rounded-xl bg-violet-400/[0.10] motion-reduce:animate-none" />
                <span className="h-11 w-32 animate-pulse rounded-xl bg-white/[0.06] motion-reduce:animate-none" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6" aria-hidden="true">
        <div className="h-24 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.025] motion-reduce:animate-none" />
      </div>
    </main>
  );
}
