# Phase 3D — Franchise Copy CSS Module Ownership

**Дата:** 2026-10-19  
**Статус:** Draft PR, без production-изменений  
**Базовый коммит:** `0c557678cd2a623e37f141c64538fba63bdf38bb`  
**Ветка:** `refactor/franchise-copy-css-phase-3d`

## 1. Предыстория и проблема

Phase 3C (PR #278, уже в main) перенёс геометрию карточек сезонов франшизы в `components/AnimeFranchise.module.css`, но текстовые стили по-прежнему разнесены между `app/anime-page-v3.css` и модулем. Это создаёт неоднозначное владение четырьмя внутренними элементами: номер сезона, метка, длинное название, год выпуска. Глобальные селекторы действуют потенциально на весь DOM, хотя эти элементы используются только в секции сезонов. При этом светлая тема, мобильный двухстрочный clamp и состояние «Сейчас» должны остаться стабильными.

Репозиторий содержит несколько слоёв глобальных CSS и `!important`. Поиск ссылок в GitHub показал, что:
- `.anime-franchise-v3__step` кроме основного CSS/TSX присутствует в offline fixture теста; менять класс или разметку запрещено.
- `.anime-franchise-v3__season-title` дополнительно регулируется `app/patch12-4-1-mobile-anime-flow.css` и `app/patch16-4-readability-theme.css`.
- `.anime-franchise-v3__current` имеет особую цветовую вариацию в `app/patch12-4-anime-page-foundation.css`; трогать глобальное активное состояние в этой волне нельзя.
- Реальный UI обеих веток (current и ссылка на другой сезон) использует локальный `styles.season`. В CI уже существует 11-размерная, двухтемная браузерная матрица `anime-layout:check`.

## 2. Цель

Полностью локализовать **базовые** текстовые свойства четырёх элементов только внутри сезонной карточки франшизы, исключив из глобального `app/anime-page-v3.css` четыре текстовых селектора. Не менять фактическую типографику, перенос длинных названий, порядок сезонов, доступность, акцент текущего сезона или responsive.

## 3. Файлы и точные изменения

**`app/anime-page-v3.css`**

Удалить безусловные базовые блоки:
- `.anime-franchise-v3__step` — 6 деклараций;
- `.anime-franchise-v3__season-label` — 3 декларации;
- `.anime-franchise-v3__season-title` — 5 деклараций (из них `overflow`, `font-size`, `white-space` уже перекрыты CSS Module);
- Составное правило `.anime-franchise-v3__year, .anime-franchise-v3__current` разделить: год переносится в Module, `current` получает исходные `color` и `font-size` без изменений.

Не затрагивать глобальное правило `.anime-franchise-v3__current` с `position, right, top, color, font-weight` и остальной CSS (таймлайн, hover, тема, related title).

**`components/AnimeFranchise.module.css`**

Добавить локальные наследственные селекторы:
- `.season :global(.anime-franchise-v3__step)`: ровно 6 прежних свойств;
- Расширить `.season :global(.anime-franchise-v3__season-label)`: добавить цвет, размер и насыщенность, сохранить `line-height: 1.4`;
- Расширить существующий `.season :global(.anime-franchise-v3__season-title)`: добавить `color` и `text-overflow`; сохранить `white-space:normal!important`, `font-size:12px!important`, `line-height:1.45!important`, 2-line clamp, overflow и перенос длинных слов;
- `.season :global(.anime-franchise-v3__year)`: добавить исходные `color` и `font-size`.

Сами классы в TSX **не переименовывать**, чтобы существующие глобальные theme/readability overrides и тестовые фикстуры продолжали находить их.

**`tests/franchise-copy-css-ownership.cjs`**

Добавить AST-контракт, который:
1. Проверяет отсутствие четырёх нерегламентированных глобальных селекторов.
2. Сверяет точные значения всех новых локальных правил.
3. Закрепляет важные `!important` у названия и наличие мобильной и тематической коррекции.
4. Фиксирует неизменность глобального активного состояния.
5. Защищает DOM-совместимость старых названий классов.

**`package.json` и workflow**

Команда `npm run franchise-copy-css:check` и отдельный шаг в `.github/workflows/animebox-quality.yml` после существующего `franchise-css:check`.
Запрещено менять `prebuild`, `app/layout.tsx`, TSX, lockfile, любые runtime-файлы или конфигурацию серверов.

## 4. Безопасность и ограничения

- Без новых глобальных CSS и без дополнительного `!important`.
- Не переносить общие значения `--ab-readable-small` и правила светлой темы из глобальных CSS: они могут охватывать и другие компоненты.
- Не затрагивать `current` в этой волне: там пересекаются 2 варианта темы и селектор `.anime-detail-v4`.
- Сохранить CSS Modules specificity `0,2,0` через родительскую `.season`, без `:global` для всего компонента.
- Не менять данные, API, SEO, player, Supabase, Telegram, Railway, Cloudflare, Vercel.
- Никаких новых зависимостей или миграций.
- Не сливать/деплоить автоматически, сохранить PR как Draft.

## 5. QA / критерии приёмки

**Автоматически:** `npm run franchise-copy-css:check`, `npm run franchise-css:check`, `npm run css-cascade:check`, `npm run anime-layout:check`, `npm run css:inventory:check`, `npx tsc --noEmit`, ESLint CSS-тронутых компонентов, полный `npm run prebuild` и `npm run build`, целиком GitHub Quality Gate.

**Браузерные сценарии:** /anime/[slug] с 2–12 сезонами, 320/360/390/412/720/767/768/1024/1366/1440/1920 px, dark/light, уменьшенное движение и увеличение масштаба 125%, горизонтальный скролл, названия без пробелов, текущая/неактивная карточка, focus/hover.

Обязательное before/after сравнение `getComputedStyle` для селекторов `step`, `season-label`, `season-title`, `year`, `current`: `font-size`, `color`, `line-height`, `font-weight`, `overflow`, `display`, `white-space`, `grid-row`, `text-overflow`. Статическое соответствие AST не считается заменой визуального QA.

## 6. Definition of Done и откат

- PR diff ограничен шестью файлами, никакого JSX/runtime изменения.
- Полный Quality Gate зеленый; отсутствие отклонений на браузерной матрице.
- PR сохраняется Draft до ревью. Merge / деплой требуют отдельного решения.
- Для отката закрыть PR либо revert конкретного коммита. Без изменений БД.

## 7. Следующий этап

После этого можно рассмотреть перенос сложного статуса текущего сезона и контейнера `anime-franchise-v3__related`. Из-за глобальной `.anime-detail-v4` цветовой вариации они должны идти в отдельный этап и только после проверки computed-style для всех тем.
