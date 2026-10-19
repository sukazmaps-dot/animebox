# AnimeBox Phase 3D — Franchise typography and status CSS ownership

**Дата:** 19.10.2026  
**Ветка:** `refactor/franchise-typography-css-phase-3d`  
**Основа:** `main`, SHA `0c557678cd2a623e37f141c64538fba63bdf38bb`.

## Исходное состояние

Phase 3C уже смёржен в `main`. `components/AnimeFranchise.module.css` владеет геометрией `seasonsRail` и `season`, но пять дочерних элементов сезонной ленты всё ещё имеют начальные правила в `app/anime-page-v3.css`:

- номер шага `.anime-franchise-v3__step`;
- метка сезона `.anime-franchise-v3__season-label`;
- название `.anime-franchise-v3__season-title`;
- год `.anime-franchise-v3__year`;
- индикатор активного сезона `.anime-franchise-v3__current`.

В `AnimeFranchise.tsx` эти пять классов присутствуют только внутри `styles.season`. Глобальные селекторы также используются в специализированных правилах темы, читабельности и медиазапросов. **Эти специализированные правила не изменять**.

## Цель

Сократить базовую глобальную CSS-поверхность франшизы, сохранив итоговый внешний вид сезонных карточек, активную метку, длинные названия, переключение темы и прокрутку.

## Точный diff

### `app/anime-page-v3.css`

Удалить единый непрерывный блок из пяти дочерних селекторов (21 декларация исходного CSS). Не удалять соседние `.anime-franchise-v3__season`, `::after`, `:hover`, `.is-current` или `.anime-franchise-v3__related`, а также заголовок франшизы.

### `components/AnimeFranchise.module.css`

Сохранить текущую структуру `.seasonsRail .season` и действующие CSS Module селекторы, добавив:

- `.season :global(.anime-franchise-v3__step)` — перенести без изменения `grid-row`, `align-self`, `color`, `font-size`, `font-weight`, `font-variant-numeric`.
- `.season :global(.anime-franchise-v3__season-label)` — перенести `color`, `font-size`, `font-weight`; сохранить `line-height: 1.4`.
- `.season :global(.anime-franchise-v3__season-title)` — перенести `color` и `text-overflow`. Сохранить действующие локальные `white-space: normal !important`, `-webkit-line-clamp: 2`, `font-size: 12px !important`, `overflow: hidden` и `line-height: 1.45 !important`. Старые `white-space: nowrap`, `font-size: 10px` и `overflow: hidden` уже затенены модулем, поэтому не повторять их.
- `.season :global(.anime-franchise-v3__year)` — перенести `color` и `font-size`.
- `.season :global(.anime-franchise-v3__current)` — перенести `font-weight: 720`; сохранить локальные `position: static`, `grid-column: 2`, `font-size: 10px`, `color: var(--ab-ui-accent)`. Удаляемые устаревшие `position: absolute; right: 10px; top: 9px` не влияют на позиционирование уже статичного элемента.

**Важная оговорка:** перенос повышает специфичность базового правила до уровня локального `.season :global(...)`. Специальные правила светлой темы с `!important`, системный readable scale и пользовательские маршруты остаются как есть. Не заменять совместимые глобальные имена классов в TSX: они всё ещё нужны этим правилам.

Никакого нового global CSS, `!important`, брейкпоинтов или файлов.

### Тесты

Расширить существующий `tests/franchise-css-ownership.cjs` без ослабления Phase 3C:
- Проверить пять новых дочерних owner-селекторов и полный список значений.
- Проверить отсутствие прежних пяти глобальных селекторов в `app/anime-page-v3.css`.
- Зафиксировать наличие всех пяти классов в JSX (по одному) и неизменность двух `styles.season` веток.
- Не менять исходный лимит глобальных импортов.

Расширить **существующий** браузерный `scripts/anime-detail-layout-smoke.mjs` (он уже запускается через `anime-layout:check` в Quality Gate):
- Получать computed styles из скомпилированного CSS Module настоящими Next PostCSS plugins.
- Для light/dark, 320–1920 px, 100–125% текста, guest/saved/resume/error, poster/banner проверять начертание шага и метки, двухстрочный clamp заголовка, `position: static` и grid placement активной метки.
- Сохранить все старые тесты геометрии, скролла, карточек, доступности и скриншоты.

`package.json` и Quality workflow не менять — команды `franchise-css:check` и `anime-layout:check` уже есть.

## Запреты

Не менять JSX, React, список сезонов, API, Supabase, R2, Telegram, Railway, Vercel, Kodik, темы и глобальные media/layer/style patches. Не заменять глобальные классы локальными хешами в JSX без отдельного этапа. Не отключать существующие проверки, не ослаблять CSS-гейты и не создавать новые `!important`.

## Проверки

1. `npm run franchise-css:check`
2. `npm run css-cascade:check` и `npm run css:inventory:check`
3. `npm run anime-layout:check` (Chromium, обе темы и широкая матрица экранов).
4. `npm run prebuild`, TypeScript/ESLint, `npm run build`, полный GitHub Actions Quality Gate.
5. Вручную — сравнить скриншоты и computed styles на реальной странице с сезонами (360/390/412/768/1366/1920 px), длинным названием, light/dark, hover/focus и прокруткой. Browser fixture не является доказательством 100% production parity.

## Definition of Done

- Глобальный CSS сократился на блок в 21 декларацию. Локальный CSS содержит только необходимые базовые owner-правила.
- В коде компонента, API и маршрутах изменений нет.
- Уже действующие глобальные light/theme/readability/mobile правила сохранены.
- GitHub Quality Gate проходит, ручное визуальное сравнение не выявляет регрессий.
- PR остаётся **Draft**, без merge/deploy. Не трогать PR #272 и заблокированный деплой Vercel.

## Откат

Закрыть Draft PR; после возможного merge сделать revert целевого commit (никаких миграций, окружения и БД).

## Дальше

После подтверждения Phase 3D начинать **Phase 4A — Anime Card CSS Ownership**: выбрать один компонент карточки, построить карту переопределений `.anime-card`, нормализовать именованные CSS Modules и отдельно тестировать постеры, рейтинги, skeleton и responsive, не добавляя global overrides.
