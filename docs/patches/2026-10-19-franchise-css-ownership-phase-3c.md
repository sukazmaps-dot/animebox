# Phase 3C — Franchise Season CSS Ownership

**Дата:** 19.10.2026  
**Ветка:** `refactor/franchise-card-css-ownership-phase-3c`  
**База:** `main` `b8d47636`

## 1. Контекст

После аудита 217 CSS-файлов и серии независимых PR #273–277 цель следующего этапа — постепенно переносить локальные правила в CSS Modules, не создавая новых глобальных слоёв. Предыдущие PR ещё не слиты, поэтому эта работа изолирована от них.

Карточки сезонов в `AnimeFranchise.tsx` используют одновременно `styles.season` и `anime-franchise-v3__season`. Базовый глобальный `app/anime-page-v3.css` до сих пор задаёт свойства, часть которых уже гарантированно заменяется более специфичным `.seasonsRail .season` в `components/AnimeFranchise.module.css`. Все два варианта рендеринга сезонных карточек используют локальный класс.

## 2. Scope / точные изменения

В `app/anime-page-v3.css` из правила `.anime-franchise-v3__season` удалить восемь свойств:
- **Перенести** в `components/AnimeFranchise.module.css`: `position: relative`, `display: grid`, `gap: 2px 10px`, `text-decoration: none`.
- **Удалить затенённые значения**, уже принадлежащие CSS Module: `grid-template-columns: 30px minmax(0,1fr)` (Module задаёт 24px), `min-height: 86px` (Module задаёт 112px), `padding: 12px 12px 11px` (Module задаёт 14px), `border-radius: 8px 14px 8px 8px` (Module задаёт 12px).

В глобальном правиле оставить неизменными `border`, `background`, `transition`. Не трогать `::after`, `:hover`, `.is-current`, мобильные переопределения, тему, анимации и внутренний скролл.

В существующий `.seasonsRail .season` CSS Module добавить четыре базовых свойства. Селектор специфичнее исходного глобального: два CSS-класса против одного. Компонент и маршруты **не менять**.

## 3. Автоматизированная защита

Добавить `tests/franchise-css-ownership.cjs` на PostCSS AST. Проверять:
1. Ровно одно глобальное правило сезона и один локальный владелец безусловно на корневом уровне.
2. Отсутствие восьми свойств в глобальном правиле, точные ожидаемые значения в модуле.
3. Сохранение global hover/current/timeline правил и всех трёх оставленных surface-деклараций.
4. Обе JSX-ветки карт сезона используют `styles.season` вместе с глобальным совместимым классом.
5. Текущий бюджет 76 глобальных импортов `app/layout.tsx` без перестановок.
6. При нарушении инвариантов тест возвращает ненулевой код.

Добавить `franchise-css:check` в `package.json` и ранний CI-шаг в `animebox-quality.yml`. **Не менять `prebuild`**: `release-consolidation:check` должен остаться первым.

## 4. Строгие ограничения

- Никаких изменений API, Supabase, SQL, R2, Railway, Telegram, Kodik и инфраструктуры.
- Никаких новых CSS-файлов/импортов и внешних npm-зависимостей.
- Не менять TSX, обработчики, семантику, ссылки, данные и логику рендеринга сезонов.
- Не чистить остальные глобальные селекторы заодно; не добавлять новые `!important`.
- Не ослаблять существующие CI-проверки, особенно CSS ownership, mobile layout, theme и Next.js build.
- Не объединять с PR #272–277 до самостоятельных проверок и контроля конфликтов.

## 5. Критерии приёмки

**Статические:** `npm run franchise-css:check`, `npm run css-cascade:check`, `npm run css-route-scope:check`, `npm run anime-layout:check`, `npx tsc --noEmit`, целевой ESLint, `npm run prebuild`, `npm run build`.

**Браузерные:** `/anime/[slug]`, тёмная/светлая темы, 360/390/412/768/1366/1920 px, наличие 1/2/нескольких сезонов, текущий сезон, hover/focus, вертикальные длинные названия, горизонтальный скролл, границы и псевдоэлементы timeline. Сравнить actual computed styles до/после для `position`, `display`, `grid-template-columns`, `gap`, `min-height`, `padding`, `border-radius`, `text-decoration`. Нельзя объявлять browser-equivalence доказанным только статическим тестом.

Только если GitHub Quality Gate успешен, diff ограничен ожидаемыми файлами и сравнение в браузере не обнаружило регрессий, PR можно переводить из Draft для ревью. **Не выполнять merge/deploy автоматически.**

## 6. Откат

До merge — закрыть PR. После merge — revert коммита, без миграций и изменений переменных окружения.

## 7. Следующие фазы

Следом можно перенести в CSS Modules остальные локальные правила `season-title`, `season-label`, `current` и аналогично оценить карточки просмотра, уведомления и редактирование профиля. Каждый набор — отдельный небольшой PR с собственным CI и скриншотами, не новая прослойка глобального CSS.
