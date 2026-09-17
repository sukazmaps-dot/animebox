import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="animebox-not-found">
      <section className="animebox-not-found__card">
        <Image
          src="/brand/illustrations/error-404.webp"
          width={720}
          height={720}
          alt=""
          aria-hidden="true"
          className="animebox-not-found__art"
          unoptimized
        />
        <span className="animebox-not-found__eyebrow">ANIMEBOX · 404</span>
        <h1>Кажется, эта страница потерялась</h1>
        <p>
          Возможно, ссылка устарела или страница переехала. Вернись на главную
          или попробуй найти нужное аниме через каталог.
        </p>
        <div className="animebox-not-found__actions">
          <Link href="/" className="btn btn--primary">На главную</Link>
          <Link href="/search" className="btn btn--ghost">Открыть каталог</Link>
        </div>
      </section>
    </main>
  );
}
