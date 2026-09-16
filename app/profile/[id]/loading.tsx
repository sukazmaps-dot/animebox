export default function PublicProfileLoading() {
  return (
    <main className="min-h-screen bg-[#080b14] text-white">
      {/* Баннер */}
      <div className="relative h-[260px] overflow-hidden bg-[#101625]">
        <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />

        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#080b14] to-transparent" />
      </div>

      <div className="relative mx-auto -mt-20 max-w-6xl px-5 pb-16">
        {/* Верх профиля */}
        <section className="flex items-end gap-5">
          <div className="h-36 w-36 shrink-0 animate-pulse rounded-full border-4 border-[#080b14] bg-[#161d30]" />

          <div className="flex-1 pb-3">
            <div className="h-7 w-48 animate-pulse rounded-lg bg-white/[0.08]" />

            <div className="mt-3 h-4 w-32 animate-pulse rounded bg-white/[0.05]" />

            <div className="mt-4 h-4 max-w-md animate-pulse rounded bg-white/[0.05]" />

            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-white/[0.04]" />
          </div>
        </section>

        {/* Статистика */}
        <section className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]"
            />
          ))}
        </section>

        {/* Основной контент */}
        <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="h-6 w-44 animate-pulse rounded bg-white/[0.07]" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.025]"
                />
              ))}
            </div>
          </div>

          <div>
            <div className="h-6 w-36 animate-pulse rounded bg-white/[0.07]" />

            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.025]"
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}