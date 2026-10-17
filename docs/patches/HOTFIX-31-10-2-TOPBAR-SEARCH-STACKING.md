# Hotfix 31.10.2 — глобальный поиск исчезает при открытии озвучки

**Проект:** AnimeBox · **Дата:** 2026-10-17 · **Приоритет:** P1 (эпизоды / глобальная навигация)
**База:** main `6b76ff9949a5e8e82d376091c524a5acd2735164` (Hotfix 31.10.1)
**Ветка:** `fix/hotfix-31-10-2-player-header-layer`

## 1. Фактическое поведение

На маршруте `/anime/sousou-no-frieren/episode/1` при раскрытии «Озвучка» исчезает верхняя строка поиска. Закрытие меню возвращает поиск. Предоставленные два скриншота демонстрируют, что верхняя часть плеера рисуется там, где обычно располагается фиксированная верхняя панель, а не удаление компонента поиска из React.

## 2. Диагностика по исходникам

- `app/globals.css`: фиксированная `.topbar { z-index:30 }`, фиксированная `.sidebar { z-index:40 }`; глобальный поиск находится внутри `.topbar`.
- `components/AnimePlayer.tsx`: внешний player root имеет `relative isolate` (самостоятельный stacking context).
- `components/EpisodePageDensity.module.css`: Hotfix 31.10.1 временно задавал внешнему root `z-index:30` при `aria-expanded=true`. Из-за равенства с topbar и более позднего DOM-положения плеер мог оказаться над поиском при прокрутке.
- Ранее тестировали `EpisodeQuickSelector`, но не рендерили глобальную шапку/поиск/сайдбар в той же проверке, поэтому регрессия не обнаруживалась.

## 3. Контракт и изменение

Нужен порядок контекстов **снизу вверх**:

1. Закрытый player root: `z-index:auto` и обычная композиция.
2. Следующие обычные карточки/серии: z-index auto; тестовый конкурирующий слой navigator z-index 10.
3. Открытый player root: `z-index:20` — выше локальной навигации, но не над глобальной шапкой.
4. Глобальная фиксированная шапка: `z-index:30` (не меняем).
5. Боковая панель: `z-index:40` (не меняем).
6. Theater/fullscreen: сохранён собственный `z-[10001]` и исключение через `data-player-theater=true`.

В **том же существующем CSS Module** изменить единственное значение у условного, route-scoped `:has()` с `30` на `20`. Не создавать глобальный override CSS, не добавлять `!important`, не трогать jsx iframe, поиск, состояния React и работу поставщиков.

## 4. Автоматические проверки и негативный контроль

В существующий `scripts/mobile-player-shell-smoke.cjs`, который запускается через `npm run mobile-player-shell:browser` внутри AnimeBox Quality Gate:

- Сохранить первоначальную матрицу 360, 390, 430, 740, 844, 960, 1100, 1440, 1920 px с истинным `isolation:isolate`, pointer hit в меню, test sibling с явным z-index 10, проверкой закрытия и theater `10001`.
- Ожидать `openRootZ=20`, `closedRootZ=auto`.
- Добавить desktop browser fixture на **1440×900 и 1920×1080** с **реальными импортами глобальных CSS и CSS Modules**: `<aside class=sidebar>`, `<header class=topbar><form class=topbar__search><input ... />`, `<div class=app-shell>`, настоящим JSX для controls/episode quick selector.
- Установить `aria-expanded=true`, проверить computed `topbar z=30`, `sidebar z=40`, `root z=20`, popup поверх nav с конкурирующим z=10.
- Проскроллить так, чтобы player media оказался **под** fixed search; `document.elementFromPoint` в центре поля поиска должен принадлежать `input` и `.topbar`.
- **Негативный контроль:** при временном `root.style.zIndex=30` над тем же fixed header поиск должен стать недоступен для hit-testing; после удаления inline override снова доступен.
- Закрыть dropdown и проверить root z-index auto.

*Контроль z-index 10 у навигации является специально выбранным стресс-сценарием. Это не утверждение о фактическом z-index этого элемента в production.*

## 5. Ручная приёмка (после выката)

1. Opera GX desktop (включая 1920×1080): открыть Фрирен, прокрутить в область плеера, открыть озвучку — поиск и аккаунт остаются видимыми, курсор попадает в поиск, шапка не затемняется/не перекрывается видео.
2. Список переводов находится над выбором серии и карточками; список прокручивается и пункты кликаются.
3. Открытие/закрытие кнопкой/Escape/outside click возвращает правильное наложение.
4. 360–430 px мобильные, 740–1100 landscape/планшеты, 1440–1920 desktop; light/dark, zoom.
5. Theater, fullscreen Telegram, Watch Together, native mobile select без новых побочных эффектов.
6. Внешняя ссылка / переход на обычные страницы не меняет поведение topbar.

## 6. Приёмка PR и релиз

- [x] Ограниченная правка в исходном CSS owner.
- [x] Дополнен source-aligned Chromium smoke с **fixed header** и негативным контролем старого значения.
- [ ] AnimeBox Quality Gate 100% SUCCESS на точном head SHA (TypeScript, lint, production Next build, regression).
- [ ] Merge PR только после успешного CI и просмотра диффа.
- [ ] Railway два проекта SUCCESS/Online, по одной working replica, без pendingWork.
- [ ] Реальный Opera GX/Telegram — визуальная приёмка; браузерная fixture не полностью заменяет реальное устройство.

## 7. Откат и ограничения

При визуальных регрессиях выполнить GitHub revert одного hotfix. Изменений Supabase, секретов, env, worker и миграций нет. Не фиксировать отдельные API-503, fonts, posters и instant search в этом CSS хотфиксе; это другие задачи.
