# PATCH 30.0 — Cinematic Home & Performance

**Дата:** 15.10.2026
**База:** main f888d0fc5c1a04fa6b541936af0bf88415e52b55
**Ветка:** feat/patch30-0-cinematic-home-performance
**Результат:** homepage redesign + media/performance hardening without API/DB migration.
**Режим выпуска:** PR-first. No direct deployment.

## 1. Зачем нужен патч

Главная AnimeBox должна ощущаться стриминговой витриной: сразу видно,
какое аниме смотреть, где продолжить и что подходит по настроению.
Блоки чата, соцфункций и сервиса не должны вытеснять рекомендации
из первого осмысленного viewport. Переход в просмотр остаётся в один клик.

Критически важно: ускорение нельзя выводить только из визуального редизайна.
Каждое изменение должно быть совместимо с существующим runtime, допускать
откат и проходить проверки mobile performance и старых патчей.

## 2. Исходное состояние (проверено в GitHub)

- Next.js App Router: публичная SSR/ISR домашняя страница (900s).
- Первые каталожные данные: сохранённый catalogue, серверный unstable_cache 300s,
  резервный вызов провайдеров только при необходимости.
- Клиентский HomeFeedRuntimeProvider: auth, локальный прогресс, resume и настроение.
- HomeHeroCarousel: SSR-stable первый слайд, autoplay только после действия.
- Hero до патча: отдельный desktop backdrop и отдельная mobile keyart Image.
- Рекомендации: dynamic import; дополнительная логика после hydration / idle.
- Каталог: две grid-секции, каждая до 10 карточек, есть прогресс из home runtime.
- HomeAnimeRail: готовая карусель, но не принимала прогресс карточек.
- Watch Together: SSR заголовок, deferred lobby; polling только при видимости.
- R2 media worker: поддержанные w96…1440, q60/70/80, WebP/AVIF.
- Next/Image global unoptimized:true защищает квоту Vercel, менять запрещено.
- CSS: накопленные патчи; route-scoped layer может изменить Home без других страниц.

Статический аудит не даёт доказательств реальных CWV или снижения трафика.

## 3. Information architecture

Новый явный DOM порядок:
1. Hero (одна сцена)
2. Continue Watching (условно при прогрессе)
3. Discovery (mood + personalised shelves + личное расписание)
4. Catalog: popular, ongoing — горизонтальные полки
5. Watch Together — компактная лобби-витрина
6. Shortcuts: каталог, релизы, трекер, комнаты
7. Deferred community/chat
8. Schedule
9. Retention/personal pulse
10. Tracker/support utilities
Справа остаётся HomeRightRail, без дублирования.

Не вводить дубль personal schedule и не добавлять server account fetch.
HomePageShell обязан остаться Server Component без 'use client'.
При пустой истории Continue Watching вообще не рисуется, а не показывает
пустую карточку. Не заменять существующие URL на новые.

## 4. Cinematic Hero — UX

Desktop:
- читаемое название, стабильный арт, прежние CTA Смотреть/Подробнее;
- pagination и swipe работают, не перекрывают ссылки;
- картинка hero не меняется сама до первого взаимодействия;
- наведение мыши допустимо, эффект отключён для reduced motion.

Mobile:
- art справа, в осмысленной области, не растягивать постер на 100% width;
- затемнение слева и снизу под текстом/кнопками;
- длинное русское название переносится без обрезки;
- места для пагинации, кнопки минимум 44px;
- при отсутствии banner разрешён cover или fallback;
- одна физическая загрузка выбранного арт-изображения на один кадр.

## 5. Cinematic Hero — сеть, рендеринг, fallback

- Применить native picture с источником max-width 768px для mobile
  и min-width 769px для desktop; выбор браузером без JS matchMedia в SSR.
- Только один Image в дереве hero вместо пары backdrop/keyart.
- Первый visible slide: loading eager и fetchPriority high.
- Следующие слайды не должны преувеличивать приоритет сети.
- НЕ создавать unconditional image preload desktop banner на телефоне.
- URL для R2 через buildAnimeBoxMediaCandidates и buildAnimeBoxMediaSrcSet;
  widths из поддержанного preset hero или large; качество 80, format webp.
- Сохранять fallback direct image URL после media edge и alternate artwork.
- При ошибке image.onError перейти к очередному attempt. Повторно не
  загружать один и тот же URL бесконечно, не блокировать ссылки при ошибке.
- Глобальная настройка next.config.ts unoptimized:true остаётся.
- Source sizes не должны запрашивать 1440px art для 390px экрана.
- На ultra-wide >=2400px R2 ограничен 1440px: art-direction выбирает
  direct original first для сохранения чёткости на 2K/4K; если он сломан,
  fallback идёт через обычные bounded attempts. Это осознанный trade-off bytes/quality.
- В случае edge 403 fallback всё равно может быть прямым источником:
  данное поведение проверяется сетевыми тестами, не предполагается успешным.
- Трансформации и большие CSS filters на мобильном LCP изображении запрещены.

## 6. Catalog shelves — UX и данные

Popular и Ongoing должны:
- сохранить заголовки, ссылки Смотреть все/Расписание, loading/error;
- использовать HomeAnimeRail вместо больших grid-сеток;
- отдавать до 10 карточек, без новой HTTP-загрузки на карточку;
- использовать тот же AnimeCard и прежнюю схему image fallback;
- получить watchedEpisode из существующей progress Map;
- не терять slug/id, click tracking и статус просмотра;
- держать стабильные размеры при загрузке шрифтов/изображений.

Desktop:
- 5/4 карточки в зависимости от ширины существующего rail;
- стрелки >=44px, клавиатурный focus-visible, native scrolling;
- стрелки disabled в конце/начале, не ловят соседние карточки;
- отсутствие автоматической смены карточек без жеста.

Mobile:
- horizontal scroll/swipe, scroll snap proximity;
- карточки занимают около 42vw (<=164px);
- стрелки скрыты, native accessibility сохранена;
- ширины 320…430px: нет overflow документа или невидимых кнопок;
- изображение poster 2:3, один fallback chain.

Performance:
- onScroll измеряет геометрию не чаще одного requestAnimationFrame;
- таймеры/rAF и ResizeObserver/MutationObserver отписываются при unmount;
- не использовать глобальный scroll handler на каждый AnimeCard;
- не добавлять per-card fetch личного прогресса;
- RelatedAnime продолжает использовать HomeAnimeRail без нового обязательного prop.

## 7. Watch Together: compact secondary surface

- Заголовок SSR и CTA остаются доступными до hydration лобби.
- Пустое состояние минимальной высоты, без резервирования большого grid.
- Когда комнаты есть: карточки и их текущие статусы видимы, CTA работает.
- Guard: гостю требуется login перед join, без обхода разрешений.
- Секрет join НЕ хранится в публичных данных и резолвится только после клика.
- Poll каждые 30 секунд только при visible и не скрытом tab.
- При hidden/offscreen request abort, interval cleanup.
- Degraded/network error отдельно от пустого состояния.
- Светлая/тёмная темы и доступные цвета остаются.

## 8. CSS архитектура

- Новый stylesheet импортируется только из app/page.tsx ПОСЛЕ patch29-1.
- Все глобальные селекторы ограничены .home-page.
- Watch Together корректируется внутри локального CSS module.
- Не вводить новую шрифтовую библиотеку или анимационный пакет.
- Не добавлять непрерывные backdrop-filter на скроллящиеся card grids.
- Цветовые токены --ab-ui-*, без жёстко заданных белых/чёрных текстов.
- Текст и CTA не должны перекрываться при 200% zoom.
- prefers-reduced-motion должен отключать необязательные переходы.
- Для широкой Home desktop sidebar остаётся в прежней геометрии.
- Править старые глобальные селекторы только отдельным regression patch.

## 9. Контракт гостя / авторизованного

Гость без истории:
- Hero + discovery + catalog показываются;
- персональные API вызовы для слежения не добавляются.

Гость с local history:
- continue resume сохраняется; карточки показывают локальный progress.

Авторизованный:
- existing serverContinue + local journal precedence сохраняется;
- новый HomeAnimeRail получает computed Map, а не повторный API запрос;
- refresh on focus/pageshow работает как раньше;
- смена настроения не перезаписывает progress.

## 10. Тестовая матрица

Viewport: 320×568, 360×740, 375×812, 390×844, 430×932, 768×1024,
1024×768, 1440×900, 1920×1080, также landscape телефон.
Themes: light, dark, system.
States: guest empty, guest history, authorized progress, no catalog,
slow images, edge 403, empty rooms, active rooms, degraded rooms,
offline/slow 4G, reduced-motion, keyboard-only.

Критерии:
- scrollWidth <= clientWidth + 1 у документа;
- 44px CTA, фокус не обрезается, нет overlapping H1/CTA/rail;
- на всех breakpoint есть один Hero, Continue без дублей;
- нет ошибки hydration при первом SSR и изменении mood;
- не возникает ошибки открытия карточек и переключения rails;
- edge fallback не даёт вечного skeleton, ссылка остаётся кликабельной;
- нет новых 401 из-за нового персонального homepage fetch;
- visibility-only room polling, безопасный join, сохранение CTA.

## 11. Performance acceptance и observability

Цели RUM p75: LCP <2.5s, INP <200ms, CLS <0.1.
Target PageSpeed mobile >=95, desktop >=98 — ориентир, не гарантия.
Тестировать одинаковые Chrome network/CPU profiles, минимум 3 cold/hot runs.
Записывать:
- LCP element URL, dimensions, transfer size, decoding time;
- TTFB HTML (cold/hot), resource timing R2 cache HIT/MISS;
- JS transfer+parse / main-thread tasks;
- image bytes before LCP, число конкурирующих запросов;
- layout shifts, hydration console errors, stale card image errors;
- домашние API request counts и room poll при hidden tab.

Улучшение в процентах заявлять только после фактических сравнительных замеров.
Static grep tests и CI build не измеряют пользовательские метрики.

## 12. Проверки качества

Обязательны:
- npm run patch30-0:check
- npm run home-hydration:check
- npm run image-delivery:check
- npm run mobile-performance:check
- npm run client-bundle:check
- npm run home-discovery:check
- npm run home-desktop-stability:check
- npm run patch29:check && npm run patch29-1:check
- npx tsc --noEmit
- targeted eslint changed TS/TSX
- full npm run build / existing prebuild checks
- браузерная регрессия при наличии Chromium runner.

**CI и браузерные измерения:** помечать PASS только после реального
отчёта запуска на данном SHA; не путать статическую проверку с perf audit.

## 13. Запрещённые изменения и риски

Не трогать Supabase/SQL/RLS, source orchestrator, player, Telegram bot,
права доступа, SEO, URL карточек, global image optimizer bypass и cron.
Не добавлять heavy deps ради полки из 10 карточек.

Риски:
- source media сменится, но fallback не переключится при ошибке;
- новые размеры арт-изображения сломают mobile clipping;
- scroll стрелки затронут позиции других rails;
- старые CSS layers перекроют route stylesheet;
- прежние order-based tests придётся изменить, но не отключить.

## 14. Release и rollback

Реализация и ТЗ в одной новой ветке от main; PR в main.
CI должен пройти по текущему head SHA перед merge.
Не делать force push; не выполнять SQL или миграции.
Откат: revert PR; отдельно вернуть Hero + его route CSS как единую пару,
если проблема относится к мобильному art direction.
Деплой только отдельным подтверждённым выпуском после merge.

## 15. Фактический статус

ТЗ определяет требования и чеклист. Lighthouse, RUM, Lighthouse scores,
фактический размер запросов и продакшен-деплой не могут считаться
подтверждёнными без соответствующих результатов проверок.
