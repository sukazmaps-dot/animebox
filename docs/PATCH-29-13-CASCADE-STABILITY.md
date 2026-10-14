# Patch 29.13 — стабильность CSS-каскада и адаптивного интерфейса
Дата: 14 октября 2026. База: main после PR #224. Ветка: fix/patch29-13-cascade-stability.

## 1. Цель
Сделать возвращение исправленных визуальных багов обнаруживаемым на CI: измерять итоговый computed CSS в браузере и исправлять реальные конфликты источника, а не добавлять бесконечные перекрывающие стили. Не менять API, Supabase, медиапрокси или бизнес-логику.

## 2. Подтверждённая первопричина
Общий Foundation v2 в app/patch17-4-2-ui-precision.css использует объединённый селектор для активных ссылок desktop-sidebar и mobile-nav. Он даёт обеим платформам заливку, 2px левый inset border и box-shadow с !important. Mobile-shell app/patch14-2-mobile-shell.css проектировал другой контракт: прозрачная плоскость кнопки и верхняя тонкая линия ::after. Из-за позднего импорта / высокой специфичности Foundation v2 может перекрывать мобильный контракт.
Ранее Patch 29.12 обнаружил такую же проблему типографики: светлая тема повышала размеры подписей компактных mood-чипов. Исправление 29.12 не трогать.
Отдельный контракт compact-landscape в app/patch16-6-responsive-layout.css специально оставляет навигацию видимой и интерактивной даже при классе is-hidden. Это ожидаемое поведение повёрнутого телефона, не баг. Не сломать его глобальными overrides.

## 3. CSS ownership
- Shared palette, desktop sidebar, generic focus — app/patch17-4-2-ui-precision.css.
- Mobile nav portrait, safe areas, account sheet — app/patch14-2-mobile-shell.css.
- Compact landscape при height<=600 и width<=1100 — app/patch16-6-responsive-layout.css.
- Главная, расписание и служебные карточки — app/home-visual-repair.css и app/patch29-1-home-mobile.css (route scope).
- Профили — app/profile/layout.tsx + replay профиля; anime/episode — app/anime/[slug]/layout.tsx + replay эпизодов.
- Mood picker — smart-home.css, discovery CSS и light 29.12.

Не добавлять новый глобальный CSS импорт (бюдж 76 файлов, root gzip до 152 КБ). Не удалять старые файлы по имени без проверки CSS-каскада. По возможности редактировать правило у владельца вместо ещё одного style override. Уважать существующие CSS route-scope gates.

## 4. P0: исправить состояние активной навигации
4.1 Разделить selector Foundation v2: selected surface + left inset 2px оставить только desktop .sidebar__item.is-active.
4.2 Mobile .mobile-nav__item.is-active получает семантический цвет из палитры, но не desktop background, box-shadow и border. Geometry/selection целиком остаётся у mobile-shell.
4.3 Не менять className, href, aria-current, порядок пяти destinations, nav hide/reveal JS, Telegram Mini App.
4.4 Не менять position, глобальные z-index, bottom safe area, body scroll-lock, CSS display desktop/landscape.
4.5 Состояние focus-visible: контрастная focus-outline на клавиатуре, верхний индикатор остаётся видимым в обеих темах, выбранный пункт читается, палитра наследуется.

## 5. P1: новый настоящий браузерный regression gate
5.1 Скрипт строит CSS bundle непосредственно из существующих import из app/layout.tsx; проверяет реальные вычисленные стили, а не наличие отдельных текстовых строк.
5.2 Без сети и production secrets: локальный HTML-фрагмент sidebar, topbar, 5 nav items, page-content, search и tracker anime-grid с длинными названиями карточек.
5.3 Матрица theme dark/light: viewport 320×700, 360×800, 390×844, 600×900, 768×1024, 769×1024, 1024×900, 1270×900, 1440×900; отдельно compact landscape 844×390 и 1024×520.
5.4 Portrait mobile: nav displayed, pointer events allowed, nav rect within viewport, пункт min-height >=44px, активный без desktop rectangle/inset box-shadow, верхний 2px indicator ::after существует и имеет цвет.
5.5 Desktop: mobile nav hidden by CSS, desktop active item retains selected background + inset border.
5.6 Portrait hidden class: mobile-nav.is-hidden уезжает вниз (computed transform не identity), pointer-events none; обычная панель при снятии класса интерактивна.
5.7 Compact landscape: sidebar скрыт; нижняя панель остаётся видимой и интерактивной даже при is-hidden согласно текущему контракту; nav height >=44px; ширина корректна.
5.8 Search/Tracker grid: карточки не вылезают за границы, нет нулевых ячеек, длинное имя не разрывает grid, real bounds проверяются, поскольку overflow-x: clip может скрыть проблему от document.scrollWidth.
5.9 Проверять именно computed style и geometry в Chromium; вывод failure должен указывать theme, width, selector и причину. Без хрупких screenshot pixel diffs.
5.10 Дополнительно PostCSS guard на ошибочное объединение desktop/mobile active selector, если новый патч снова попробует вернуть box-shadow/selected fill.
5.11 CI должен вызывать browser gate после установки Chromium, а prebuild — статический guard без браузера. Не копировать существующие palette smoke проверки.

## 6. P2: ручная и live-приёмка после публикации
Матрица: 320, 360, 390, 600, 768, 844 landscape, 1024 landscape, 1270, 1440, 1920, 2560; dark/light/system, guest/auth, reduced motion, zoom 200%, длинные тайтлы, пустой и ошибочный schedule, Telegram Mini App.
Home: hero, продолжить, Watch Together, mood, schedule, utility, правый rail, горизонтальные ленты — ни одна секция не скачет и не создаёт page overflow.
Каталог: поиск, фильтры, mood dropdown, карточки, скелетоны, пустой ответ. Трекер: постеры, ширина карточек, перенос текста, гостевой режим.
Anime details: CTA, библиотека, рейтинг, описание не перекрываются на mobile. Profile/edit: save dock находится выше навигации, preview FAB выше save dock, нижние пресеты прокручиваются. Settings guest: переключение темы и локальные настройки доступны, приватные APIs не открываются.
Tooltip/modal/account: popup не обрезается, nav не захватывает клики модалки. Клавиатурный фокус, touch target не ниже 44px. На телефоне обычный scroll-hide работает; в landscape навигация всегда доступна.

## 7. Нефункциональные требования
- Без новых npm-зависимостей и новых глобальных style-импортов.
- No TypeScript behavior changes, no database migration, no auth policy/RLS changes.
- Размер CSS bundle и импортов не увеличивать сверх текущего бюджета.
- Цвета семантические var(--ab-ui-*), не произвольный hex в общих компонентах.
- Изменения локальные и документированы комментариями. Никаких широких !important/overflow:hidden для маскировки.
- Performance: никакого scroll listener, ResizeObserver или дополнительных fetch ради этого патча.

## 8. Release gates
A. Static: CSS ownership guard, existing css-route-scope, mobile-shell, frontend-architecture, palette, prebuild.
B. Browser: new computed CSS contract dark/light × portrait/desktop/landscape, затем existing palette, editor dock, cinematic detail tests.
C. TypeScript, scoped ESLint, production Next build, все обязательные GitHub Actions успешны.
D. PR review и merge только после green Quality Gate; production Railway обязан подтвердить именно новый SHA в blissful-mercy (youranimebox.com). Успех вспомогательного motivated-growth не считается production.
E. Проверить runtime/HTTP главной, поиска, настроек после deploy. Если builder выдаёт Canceled/context canceled, это отдельный инцидент платформы, не признак исправленного фронтенда.
F. При регрессии — revert PR и redeploy прежнего стабильного SHA. Не force-push main, не трогать DB.

## 9. Definition of Done
- [ ] Source-level конфликт mobile active desktop removed.
- [ ] Реальный браузерный guard в CI проходит на обеих темах и разных ориентациях.
- [ ] Root CSS constraints без ухудшения; старые тесты не сломаны.
- [ ] PR описывает изменённые файлы, найденные причины и пределы проверок.
- [ ] Quality Gate SUCCESS.
- [ ] Merge main; новый основной Railway deployment SUCCESS; smoke подтверждён.
- [ ] Непроверенные маршруты и hardware-устройства явно перечислены, не заявлены исправленными.

## 10. Не входит
Устранение 403 upstream-постеров, Kodik source, расписания backend, рассинхронизации leaderboard, Telegram webhook, RLS, deploy secret management и массовое удаление legacy CSS — отдельные задачи с собственными регрессиями и риск-анализом.
