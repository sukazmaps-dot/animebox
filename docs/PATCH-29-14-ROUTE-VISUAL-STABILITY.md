# AnimeBox — Patch 29.14: Route Visual Stability

Дата: 14.10.2026. База: main после Patch 29.13 (PR #225). Ветка: fix/patch29-14-route-layout-stability.

Продолжение 15.10.2026: [подробное ТЗ завершения PR #226 и мобильной пагинации](PATCH-29-14-STABILIZATION-SPEC.md).
Последний CI выявил замер во время CSS theme transition; исходный порог 4.5:1 сохранён,
измерение теперь завершается после конечных переходов и использует реальный фон текста.
Тип: UI, CSS, тесты и документация. Без БД/SQL, новых пакетов, auth/RLS, media API.

## 0. Executive summary и предел достоверности

Цель — проверять не только абстрактные CSS-компоненты, но и вёрстку маршрутов: каталог /search, трекер /list, синематик /anime/[slug], публичный профиль /profile/[id], гостевые настройки /settings.

Разделить уровни проверки. A — ACTUAL BUILT ROUTE: продакшен HTML из Next .next/server/app + реальные assets; гостевые /list и /settings. B — SOURCE-EQUIVALENT FIXTURE: построенная по реальной JSX-структуре модель сложного динамического маршрута с фактическими CSS-модулями и глобальными стилями. Отдельно обозначить, что эта фикстура не исполняет server-render profile/anime с настоящими данными. C — LIVE SMOKE: внешний публичный read-only маршрут после деплоя. Никаких заявлений о полном E2E или наличии авторизованной библиотеки без настоящего тестового сеанса.

Основной принцип: лечить причины конфликтов в исходном CSS/JSX; нельзя маскировать overflow общим hidden, переламывать global z-index или добавлять ещё один root override.

## 1. Выявленный баг трекера: светлая тема

В app/list/page.tsx прогресс series отображается с Tailwind text-white/80 независимо от темы. На белом/светлом surface это низкий контраст. Подписи имеют полупрозрачный цвет, смешанный с transparent, а background дорожки bg-white/0.055 плохо читается на светлой поверхности.

ТЗ: заменить цвет заголовка статуса на var(--ab-ui-text), подпись на var(--ab-ui-muted), счётчик — на var(--ab-ui-accent) или достаточно контрастный muted, дорожку — на var(--ab-ui-border). Заполнение прогресса и числовые вычисления не менять. Текст должен иметь WCAG AA 4.5:1, сильный видимый focus, действие «Продолжить» не менее 44px высотой. Не менять статусы, фильтрацию, синхронизацию или сохранение.

## 2. Маршрут /search
- Заголовок, вкладки Каталог / Сохранённые, панель фильтров, настроения, выдача результатов, loading, empty и error.
- Постеры 2:3, рейтинг, meta, заголовки до двух строк; длинные заголовки не деформируют grid.
- Размеры 320/360/390/768/844 landscape/1024/1440/1920, dark и light.
- Содержимое grid не выходит за правый край, не имеет отрицательных/нулевых размеров.
- Dropdown MoodFilter сохраняет placement, keyboard navigation, выбранное состояние (отдельные текущие tests).
- Offline fixture применяет реальные CSS, а не выдаёт себя за динамический результат от сервера.

## 3. Маршрут /list
- Actual built guest /list должен выводить гостевую страницу без случайных приватных данных.
- В auth-equivalent fixture: две/три карточки с длинными названиями, status watching/planned/completed и текстовым прогрессом; всё без реального аккаунта и запросов.
- Проверить responsive карточек, детали статуса, контраст в обеих темах, CTA, горизонтальный overflow документа, safe-area снизу.
- Исправление text-white/80 обязано быть защищено source guard, возвращение непрозрачного белого в progress = провал prebuild.

## 4. Маршрут /anime/[slug]
- Сохранять существующую структуру detail_layout > hero > heroContent > identity/facts/actions/description; ниже related/episodes/discussion.
- Учитывать long title, guest/saved/resume/error, wrapped buttons, synopsis, ограничения ширины десктопа.
- До 767px watch CTA занимает отдельную строку, favorite и tracker 48px, description ниже actions с положительным вертикальным зазором.
- Не загружать Kodik, не менять SEO, player или availability.

## 5. Маршрут /profile/[id]
- Публичный hero с banner, аватаром, длинным никнеймом, бейджем уровня, bio, датой и действиями.
- Статистика (серии, завершённые, время, комментарии), виджеты и достижения; строки не пересекаются.
- Normal и Premium theme CSS; test fixture без реальных profile IDs, изображений и Supabase.
- Декоративный premium frame не перекрывает ник/уровень; avatar layout резервирует площадь; text wrap при длинных словах.

## 6. Маршрут /settings
- Built guest HTML, возможность входа в настройки без регистрации, гостевые переключатели темы/motion/плеера, отсутствие приватных API в guest.
- Использовать существующий settings-guest-smoke и минимальную новую проверку whole-page geometry; не дублировать проверку пользовательского состояния.
- Клавиатурный focus, нижняя навигация и безопасные зоны доступны.

## 7. Адаптивные инварианты
- Список базовых viewport: 320x700, 360x800, 390x844, 768x1024, 844x390 landscape, 1024x900, 1440x900, 1920x1080; при ручном QA добавить 600, 1270, 2560.
- Обе темы; reduced-motion. 200% browser zoom покрывается уменьшением CSS viewport или отдельным ручным тестом; не заявлять полную проверку screen zoom при имитации.
- Document scrollWidth <= innerWidth + 1, но это недостаточно: проверять bounding box основных элементов и card actions, потому что overflow:clip скрывает последствия.
- Никнейм/название содержат обычные пробелы и сверхдлинный непрерывный токен: не ломают ширину.
- Минимум 44px для главных touch actions; focus-visible; декоративные картинки с alt пустым, информативные alt текстом.
- Для расписания и карточек не менять медиаисточник, детальную логику loading/SSR.
- Цвета только семантические --ab-ui-*; обычный текст не менее 4.5:1.

## 8. Ownership, тесты и CI
- app/list/page.tsx владеет разметкой статуса progress. Цвет заменить прямо там; не создавать новый CSS файл.
- scripts/route-layout-contract-check.cjs: статический guard, без Chromium и сети.
- scripts/route-layout-matrix-smoke.cjs: Chromium; реальные предсобранные guest pages + честно помеченные source fixtures для динамических route; запрет сторонних запросов, стабильные детерминированные данные.
- package.json: source check в prebuild строго ПОСЛЕ обязательного release-consolidation:check. Browser script отдельной npm командой.
- GitHub Actions: after Production build + settings-guest-smoke, run new route browser check.
- Использовать установленный в workflow Playwright (не новый npm dependency). Реальный css import/cascade, postcss scoped modules где нужно, без цветного screenshot сравнения по пикселям.
- Error messages: имя маршрута, theme, width и нарушенный элемент; без произвольных таймаутов и повторов, скрывающих race conditions.

## 9. Приёмка и релиз
1. Инструментально подтверждён баг белого текста; поправить и протестировать.
2. Гостевые /list и /settings — actual built HTML, не фикция входа.
3. Каталог, публичный профиль и детали аниме — source-equivalent CSS fixtures; не выдавать их за реальные динамические HTTP маршруты.
4. Source test, существующие css-cascade/route-scope, palette, TypeScript, lint и Next production build SUCCESS.
5. Все Playwright fixtures SUCCESS в обеих темах/размерах, без сетевых вызовов на рабочий сайт.
6. PR в ветке, обязательные CI green, merge только после успеха; deploy main.
7. Production — Railway blissful-mercy с доменом youranimebox.com. SUCCESS вспомогательного motivated-growth не достаточен. Проверить новый SHA и безопасный публичный HTTP smoke, не изменяя user data.
8. Резервный план: git revert PR, новый deploy, не force-push main. БД не менялась.

## 10. Вне scope / оставшиеся риски
Полный authenticated end-to-end трекера требует тестового пользователя и тестовой DB; не подменять фикстурой. Dynamic SSR для профиля/тайтла, внешние постеры/кеш R2, Kodik, Telegram Mini App hardware, live chat, SEO crawling, ranking SQL и расчёт фактических часов просмотров — отдельные тестовые наборы. Снимки экрана и фикстуры не доказывают реальную региональную доставку всех ресурсов.

## 11. Definition of Done
- [ ] Реальный исправленный контраст прогресса трекера.
- [ ] Добавлены source и browser guards.
- [ ] Проверены actual гостевые страницы, а динамические фикстуры явно помечены.
- [ ] CI green включая production build.
- [ ] PR слит и primary Railway deployment SUCCESS для merge SHA.
- [ ] Технические ограничения и результаты записаны, никаких неподтверждённых заявлений про работу всех страниц.
