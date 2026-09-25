import Link from 'next/link';

export default function PlaybackRestrictionNotice() {
  return (
    <aside className="rounded-2xl border border-amber-200/10 bg-amber-100/[0.035] p-5 md:p-6">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-200/60">
        CONTENT NOTICE
      </span>
      <strong className="mt-2 block text-sm font-bold text-white/90 md:text-base">
        Просмотр этого тайтла недоступен
      </strong>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-white/45 md:text-sm md:leading-6">
        Воспроизведение для этого тайтла отключено. Описание, рейтинг и функции
        личной библиотеки остаются доступны.
      </p>
      <Link
        href="/copyright"
        className="mt-4 inline-flex text-xs font-semibold text-violet-300/80 transition hover:text-violet-200"
      >
        Подробнее →
      </Link>
    </aside>
  );
}
