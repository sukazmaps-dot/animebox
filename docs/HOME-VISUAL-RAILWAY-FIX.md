# AnimeBox: ТЗ и реализация патча главной и аналитики Railway

## 1. Цель и границы

Исправить подтверждённые скриншотами дефекты главной страницы и ошибки
аналитики после смены хостинга. Сохранить фирменное оформление, карусель,
персональные рекомендации, действия карточек, доступность клавиатурой.
Патч не требует включения ANIMEBOX_EDGE_ORIGIN_SECRET, смены DNS,
создания VPS или изменения прав Supabase.

Базовая ветка main: 85d86453. Рабочая ветка fix/home-visual-railway-analytics
также включает ранее подготовленный коммит da8a9d83 с исправлениями
Shikimori media proxy, поиска и Telegram-карточки. Его исходники сохранены.

## 2. Что показывают скриншоты

| Наблюдение | Подтверждение кодом | Требуемый результат |
| --- | --- | --- |
| На телефоне название «Провожающая в последний…» обрезано | mobile CSS задаёт line-clamp: 2, overflow: hidden и фиксированную высоту | Полное название с переносом, кнопки и индикаторы не перекрываются |
| «История продолжается» с одним тайтлом занимает высокую полку | Все полки используют вертикальный постер и одинаковый минимальный body | При 1–2 результатах на desktop — компактная горизонтальная карточка |
| Низ главной имеет неодинаковую композицию | Footer трекера использует старые именованные grid areas для другой разметки | Последовательные заголовок, описание и действие без неявных колонок |
| Telegram CTA мелкая, много места занято декором | Ранее подготовлена изолированная CSS module без старых глобальных классов | Читаемая кнопка, текст в потоке, закрытие без наложения |
| Некоторые постеры расписания — заглушки | Shikimori URL требуют серверной доставки и корректного Referer | Правильная цепочка источников, локальная заглушка лишь при недоступности |
| Product analytics POST получает 403 | Сравнение Origin с внутренним request.url, например localhost:8080 | Canonical HTTPS origin разрешён при внутреннем HTTP URL |
| Vercel insights script не исполняется, MIME text/plain | Analytics безусловно вставляется на всех хостингах | Компонент только при VERCEL=1 |
| DevTools сообщает о поле без id/name | У поиска Navbar нет name | name=q на интерактивном и fallback поле |
| DevTools сообщает о размерах lazy images | У основного img в AnimeImage нет width/height | Явные размеры 400x600; внешний контейнер продолжает определять геометрию |
| CSP запрещает eval; DoubleClick блокируется | Источник eval по скриншоту неизвестен; DoubleClick имеет ERR_BLOCKED_BY_CLIENT | Не расширять CSP без воспроизводимого стека; не обходить блокировщик |

## 3. Мобильный hero

### Поведение
- На ширинах до 768px снять двухстрочное ограничение и верхний max-height.
- Вывести полное название через обычный block, переносить по словам.
- Длинные непрерывные слова не расширяют страницу: overflow-wrap:anywhere.
- Для заголовков длиннее 55 символов оставить существующий is-long-title.
- Использовать меньший диапазон размера шрифта для длинных названий.
- Минимальная высота hero и content — 25rem, фактическая может расти.
- Верхний padding 7rem сохраняет место для key art, нижний 4.5rem — для nav.
- Кнопки не меньше 2.75rem по высоте, текст .875rem.
- Сохранить ссылки Смотреть/Подробнее, swipe, dots, reduced motion.

### Приёмка
Проверить 320, 360, 390, 399, 430, 768px и масштаб текста 200%.
Проверить короткий тайтл, «Провожающая в последний путь Фрирен», тайтл
длиннее 55 символов, длинное слово, переключение слайдов.
Не должно быть многоточия, горизонтальной прокрутки документа или
перекрытия h1/CTA/nav. Если текст не помещается, растёт hero.

## 4. Редкие персональные полки

### Правила
- Число результатов определяется уже существующим data-recommendation-rail-items.
- На desktop от 769px при ровно одном или двух результатах карточка горизонтальная.
- Постер занимает колонку 7rem с прежним aspect-ratio 2/3.
- Body располагается справа, min-height:0, действия сохраняются.
- Ширина карточки clamp(20rem,32vw,27rem), не больше viewport.
- Полки с тремя и более карточками и все мобильные полки сохраняют обычный вид.
- Никаких случайных тайтлов или дубликатов для визуального заполнения.
- Не менять rails order, React keys, virtual window или ScrollRow momentum.

### Приёмка
Сравнить 1, 2, 3, 6 результатов на 1024/1440/1920px.
Одна карточка не резервирует высоту большого вертикального постера.
Перейти по постеру и заголовку, добавить в список, применить feedback.
Проверить догрузку, переход sparse -> обычная полка и смену настроения.

## 5. Нижние служебные карточки

- У трекера заменить старую двухколоночную grid-композицию на flex column.
- Header, copy и CTA следуют реальному порядку DOM.
- Текст переносится внутри своей карточки, min-width:0.
- CTA находится снизу, имеет max-width:100%, допускает перенос текста.
- Telegram использует изолированную CSS module из сохранённого media-патча.
- Декоративный самолёт не занимает основной footer; для WT допустима отдельная art колонка.
- На desktop Telegram section растягивается до высоты grid cell.
- Существующие переходы к одной колонке на телефоне сохраняются.
- Проверить Telegram dismiss и сохранение скрытия на 7 дней.

## 6. Постеры и изображения

### Сохранённый media-патч
- Shikimori не запрашивается напрямую как browser fallback.
- Разрешённые upstream hosts остаются ограниченными; private IP запрещены.
- Для Shikimori использовать Referer и User-Agent на сервере.
- Redirect проверяется до следующего запроса; нельзя перейти на private host.
- Поддержать однократно/двукратно закодированные URL из старых данных.
- Проверять MIME, таймаут, предельный размер ответа.
- При upstream failure отдавать ограниченно кэшируемую настоящую SVG-заглушку.
- Worker и RU media сервер имеют соответствующие проверки.
- Сохранять логотип-заглушку, если coverImage отсутствует: не придумывать постер.

### Дополнение этого патча
- Основной img в AnimeImage получает width=400 и height=600.
- CSS width/height 100%, object-fit и родительский aspect-ratio остаются хозяевами layout.
- Не включать eager для всех полок и не делать лишние запросы на каждый тайтл.
- Убедиться, что расписание с null coverImage остаётся читаемым и кликабельным.

### Ограничения
Реальные серверы провайдеров могут оставаться недоступными. Корректная заглушка
не является восстановленным постером. Если обновляется media Worker, исходник
нужно отдельно задеплоить в Cloudflare; Railway не публикует Worker автоматически.

## 7. Аналитика и защита запросов

### Исправление product и monetization
- Использовать существующий isAllowedBrowserOrigin.
- В Production доверять только https://youranimebox.com и https://www.youranimebox.com.
- Не выводить доверенный origin из x-forwarded-host или произвольного Host.
- На Vercel Preview и в development оставлять точный origin request.url.
- Запросы sec-fetch-site:cross-site отклонять 403.
- Product origin проверять до сетевого rate limiter.
- Сохранить rate limit 180/min, 32KB body, максимум 20 событий.
- Сохранить allowlist событий, валидацию ID, dedupe и server-derived userId.
- Не принимать userId из тела; данные пользователя получают через auth.getUser.
- Сохранить Cache-Control private,no-store для успешной записи.
- Не менять обработку платежей, entitlement, premium или права БД.

### Vercel Analytics
- Вставлять Analytics только при process.env.VERCEL === '1'.
- Railway и Cloudflare не должны запрашивать /_vercel/insights/script.js.
- ProductAnalyticsTracker и Yandex Metrika продолжают работать.
- Никакие значения секретов не попадают в клиентскую конфигурацию.
- Проверку выполнить после новой сборки: старые открытые вкладки могут иметь старый bundle.

## 8. DevTools и доступность

- У Navbar search и его Suspense fallback добавить name=q.
- Fallback input имеет aria-label, остаётся readOnly и вне tab order.
- Сохранить доступные названия действий и кнопки закрытия Telegram.
- Не добавлять unsafe-eval для устранения сообщения CSP без установления скрипта.
- ERR_BLOCKED_BY_CLIENT у DoubleClick не лечится разрешением рекламного запроса в CSP.
- В приёмке отделить ошибки first-party приложения от блокировщика и расширений.

## 9. Файлы текущего дополнения

- app/home-visual-repair.css — home geometry.
- app/page.tsx — route-scoped stylesheet.
- app/layout.tsx — host-dependent Vercel Analytics.
- app/api/analytics/product/route.ts — Railway origin guard.
- app/api/analytics/monetization/route.ts — тот же guard.
- components/AnimeImage.tsx — размеры основного img.
- components/Navbar.tsx — атрибуты поиска.
- tests/analytics-railway-origin.cjs — regression tests реальных обработчиков.
- package.json — проверка в prebuild.

## 10. Проверки и выпуск

1. Unit/handler: canonical origins через localhost:8080 принимаются обоими endpoints.
2. Отрицательные: чужой сайт, insecure HTTP, порт, null, подделанный suffix,
   forwarded host и cross-site не допускаются к parsing/storage.
3. Limits: 413 при oversized content-length, 429 от product limiter.
4. Auth: forged userId игнорируется; Preview не доверяет production origin.
5. Существующие browser origin и media tests, включая SSRF и broken provider.
6. TypeScript без ошибок и полный npm run build с обязательными prebuild checks.
7. Визуальные проверки реального CSS и representative DOM на телефоне/desktop.
8. После выпуска на Railway проверить homepage, schedule, search, auth,
   Telegram, WT, product analytics POST и отсутствие Vercel script запросов.
9. Worker-only изменения публикуются отдельным процессом Cloudflare.
10. Откат: revert кода патча и повторная сборка; DNS/секрет шлюза не трогаются.

Статус фактических проверок фиксируется отдельно по завершении.

## 11. Фактически выполненная проверка

- Новый тест обоих analytics endpoints — PASS.
- Existing browser-origin guards — PASS.
- schedule-media:check — PASS (proxy/SSRF, provider outage, catalog recovery, manifest).
- npx tsc --noEmit — PASS.
- Targeted ESLint — 0 errors; 4 существующих предупреждения raw img/unused disable.
- Полный npm run build — PASS, включая все обязательные prebuild gates.
- CSS проверен парсером PostCSS.
- Production credentials в этой рабочей копии отсутствуют: prerender главной
  использовал предусмотренные fallback; запись реальных событий в Supabase
  и выдача реальных upstream posters здесь не проверялись.
- Browser visual QA не выполнен: Chromium отсутствует, загрузка браузера
  завершилась повреждённым ZIP. Изменения CSS проверены кодом и сборкой;
  размеры/перекрытия в живом браузере нужно проверить по матрице приёмки.
- Источник CSP eval сообщения остаётся неустановленным; policy не ослаблена.
